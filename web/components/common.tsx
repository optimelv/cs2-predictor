import { Link } from "react-router-dom";
import { Crest } from "./crest";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";
import { teamKey, type DeskData } from "@/lib/data";
export function State({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  );
}
export function Team({
  name,
  data,
  linked = false,
}: {
  name: string;
  data: DeskData;
  linked?: boolean;
}) {
  const content = (
    <>
      <Crest name={name} src={data.assets[teamKey(name)]?.logo_url} />
      <bdi>{name}</bdi>
    </>
  );
  return linked ? (
    <Link className="team" to={"/teams/" + encodeURIComponent(name)}>
      {content}
    </Link>
  ) : (
    <span className="team">{content}</span>
  );
}
