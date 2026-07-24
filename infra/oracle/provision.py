from __future__ import annotations

import base64
import json
import os
import sys
import time
from pathlib import Path

import oci


REGION = "eu-frankfurt-1"
SHAPE = "VM.Standard.A1.Flex"
OCPUS = 1.0
MEMORY_GB = 6.0
BOOT_VOLUME_GB = 50
DISPLAY_NAME = "strikesignal-worker"
VCN_NAME = "strikesignal-vcn"
SUBNET_NAME = "strikesignal-public"
VCN_CIDR = "10.42.0.0/16"
SUBNET_CIDR = "10.42.0.0/24"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def output(name: str, value: str) -> None:
    print(f"{name}={value}")
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with Path(github_output).open("a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")


def wait_resource(getter, resource_id: str, state: str = "AVAILABLE"):
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        resource = getter(resource_id).data
        lifecycle_state = getattr(resource, "lifecycle_state", "")
        if lifecycle_state == state:
            return resource
        if lifecycle_state in {"FAILED", "TERMINATED"}:
            raise RuntimeError(f"Resource {resource_id} entered lifecycle state {lifecycle_state}.")
        time.sleep(5)
    raise TimeoutError(f"Resource {resource_id} did not reach {state} within 600 seconds.")


def first_named(items, name: str):
    return next((item for item in items if item.display_name == name), None)


def ensure_network(network, compartment_id: str):
    vcns = network.list_vcns(compartment_id, display_name=VCN_NAME).data
    vcn = next((item for item in vcns if item.lifecycle_state != "TERMINATED"), None)
    if not vcn:
        response = network.create_vcn(
            oci.core.models.CreateVcnDetails(
                compartment_id=compartment_id,
                display_name=VCN_NAME,
                cidr_blocks=[VCN_CIDR],
                dns_label="strike",
            )
        )
        vcn = wait_resource(network.get_vcn, response.data.id)

    gateways = network.list_internet_gateways(compartment_id, vcn_id=vcn.id).data
    gateway = first_named(gateways, "strikesignal-internet-gateway")
    if not gateway:
        response = network.create_internet_gateway(
            oci.core.models.CreateInternetGatewayDetails(
                compartment_id=compartment_id,
                vcn_id=vcn.id,
                display_name="strikesignal-internet-gateway",
                is_enabled=True,
            )
        )
        gateway = wait_resource(network.get_internet_gateway, response.data.id)

    route_tables = network.list_route_tables(compartment_id, vcn_id=vcn.id).data
    route_table = first_named(route_tables, "strikesignal-public-routes")
    route_rule = oci.core.models.RouteRule(
        destination="0.0.0.0/0",
        destination_type="CIDR_BLOCK",
        network_entity_id=gateway.id,
    )
    if not route_table:
        response = network.create_route_table(
            oci.core.models.CreateRouteTableDetails(
                compartment_id=compartment_id,
                vcn_id=vcn.id,
                display_name="strikesignal-public-routes",
                route_rules=[route_rule],
            )
        )
        route_table = wait_resource(network.get_route_table, response.data.id)

    security_lists = network.list_security_lists(compartment_id, vcn_id=vcn.id).data
    security_list = first_named(security_lists, "strikesignal-web-only")
    if not security_list:
        ingress = [
            oci.core.models.IngressSecurityRule(
                protocol="6",
                source="0.0.0.0/0",
                source_type="CIDR_BLOCK",
                tcp_options=oci.core.models.TcpOptions(
                    destination_port_range=oci.core.models.PortRange(min=port, max=port)
                ),
                description=f"Public web traffic on TCP {port}",
            )
            for port in (80, 443)
        ]
        egress = [
            oci.core.models.EgressSecurityRule(
                protocol="all",
                destination="0.0.0.0/0",
                destination_type="CIDR_BLOCK",
                description="Required outbound access for package and data refreshes",
            )
        ]
        response = network.create_security_list(
            oci.core.models.CreateSecurityListDetails(
                compartment_id=compartment_id,
                vcn_id=vcn.id,
                display_name="strikesignal-web-only",
                ingress_security_rules=ingress,
                egress_security_rules=egress,
            )
        )
        security_list = wait_resource(network.get_security_list, response.data.id)

    subnets = network.list_subnets(compartment_id, vcn_id=vcn.id, display_name=SUBNET_NAME).data
    subnet = next((item for item in subnets if item.lifecycle_state != "TERMINATED"), None)
    if not subnet:
        response = network.create_subnet(
            oci.core.models.CreateSubnetDetails(
                compartment_id=compartment_id,
                vcn_id=vcn.id,
                display_name=SUBNET_NAME,
                cidr_block=SUBNET_CIDR,
                dns_label="public",
                prohibit_public_ip_on_vnic=False,
                route_table_id=route_table.id,
                security_list_ids=[security_list.id],
            )
        )
        subnet = wait_resource(network.get_subnet, response.data.id)
    return subnet


def public_ip_for_instance(compute, network, instance) -> str:
    attachments = compute.list_vnic_attachments(
        compartment_id=instance.compartment_id,
        instance_id=instance.id,
    ).data
    for attachment in attachments:
        vnic = network.get_vnic(attachment.vnic_id).data
        if vnic.public_ip:
            return vnic.public_ip
    return ""


def existing_instance(compute, compartment_id: str):
    instances = compute.list_instances(compartment_id, display_name=DISPLAY_NAME).data
    return next((item for item in instances if item.lifecycle_state != "TERMINATED"), None)


def latest_a1_image(compute, compartment_id: str):
    images = compute.list_images(
        compartment_id=compartment_id,
        operating_system="Canonical Ubuntu",
        operating_system_version="24.04",
        shape=SHAPE,
        sort_by="TIMECREATED",
        sort_order="DESC",
    ).data
    compatible = [image for image in images if "aarch64" in image.display_name.lower()]
    if not compatible:
        raise RuntimeError("No Canonical Ubuntu 24.04 aarch64 image is available for A1.")
    return compatible[0]


def launch(compute, identity, network, compartment_id: str, subnet_id: str):
    current = existing_instance(compute, compartment_id)
    if current:
        if current.lifecycle_state == "STOPPED":
            compute.instance_action(current.id, "START")
            current = wait_resource(compute.get_instance, current.id, "RUNNING")
        ip = public_ip_for_instance(compute, network, current)
        return current, ip, "existing"

    image = latest_a1_image(compute, compartment_id)
    ssh_public_key = Path(required_env("SSH_PUBLIC_KEY_FILE")).read_text(encoding="utf-8").strip()
    cloud_init = Path(required_env("CLOUD_INIT_FILE")).read_bytes()
    metadata = {
        "ssh_authorized_keys": ssh_public_key,
        "user_data": base64.b64encode(cloud_init).decode("ascii"),
    }
    ads = identity.list_availability_domains(compartment_id).data
    capacity_errors = []
    for ad in ads:
        details = oci.core.models.LaunchInstanceDetails(
            availability_domain=ad.name,
            compartment_id=compartment_id,
            display_name=DISPLAY_NAME,
            shape=SHAPE,
            shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(
                ocpus=OCPUS,
                memory_in_gbs=MEMORY_GB,
            ),
            source_details=oci.core.models.InstanceSourceViaImageDetails(
                source_type="image",
                image_id=image.id,
                boot_volume_size_in_gbs=BOOT_VOLUME_GB,
            ),
            create_vnic_details=oci.core.models.CreateVnicDetails(
                subnet_id=subnet_id,
                assign_public_ip=True,
                display_name="strikesignal-primary-vnic",
            ),
            metadata=metadata,
        )
        try:
            response = compute.launch_instance(details)
            instance = wait_resource(compute.get_instance, response.data.id, "RUNNING")
            return instance, public_ip_for_instance(compute, network, instance), "created"
        except oci.exceptions.ServiceError as error:
            message = f"{error.code}: {error.message}"
            if "capacity" not in message.lower() and "out of host" not in message.lower():
                raise
            capacity_errors.append({"availability_domain": ad.name, "error": message})

    print(json.dumps({"status": "capacity_wait", "attempts": capacity_errors}, indent=2))
    return None, "", "capacity_wait"


def main() -> int:
    if required_env("OCI_REGION") != REGION:
        raise RuntimeError(f"Refusing to provision outside the Always Free home region {REGION}.")
    compartment_id = required_env("OCI_COMPARTMENT_OCID")
    config = {
        "user": required_env("OCI_USER_OCID"),
        "fingerprint": required_env("OCI_FINGERPRINT"),
        "tenancy": required_env("OCI_TENANCY_OCID"),
        "region": REGION,
        "key_file": required_env("OCI_KEY_FILE"),
    }
    oci.config.validate_config(config)
    signer = oci.signer.Signer(
        tenancy=config["tenancy"],
        user=config["user"],
        fingerprint=config["fingerprint"],
        private_key_file_location=config["key_file"],
    )
    compute = oci.core.ComputeClient(config, signer=signer)
    network = oci.core.VirtualNetworkClient(config, signer=signer)
    identity = oci.identity.IdentityClient(config, signer=signer)

    subnet = ensure_network(network, compartment_id)
    instance, public_ip, status = launch(compute, identity, network, compartment_id, subnet.id)
    output("status", status)
    output("public_ip", public_ip)
    if public_ip:
        output("worker_url", f"https://{public_ip.replace('.', '-')}.nip.io")
    if instance:
        print(json.dumps({
            "status": status,
            "instance_id": instance.id,
            "lifecycle_state": instance.lifecycle_state,
            "public_ip": public_ip,
            "shape": SHAPE,
            "ocpus": OCPUS,
            "memory_gb": MEMORY_GB,
            "boot_volume_gb": BOOT_VOLUME_GB,
        }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "error", "error": repr(exc)}, indent=2), file=sys.stderr)
        raise
