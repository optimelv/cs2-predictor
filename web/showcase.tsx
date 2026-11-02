import { useState } from "react";
import { StateMatrix, previewState } from "@/components/state-matrix";
import { ColorPair } from "@/components/color-pair";
import { Check, RefreshCw, Search, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

import { Series } from "@/components/series";
import { BracketLane } from "@/components/bracket-lane";
import { type Match, type DeskData } from "@/lib/data";
const specimenData: DeskData = {
  snapshot: { coverage: { events: [], daily_matches: [] } },
  players: [],
  assets: {},
  warnings: [],
};
const specimen: Match = {
  match_id: "specimen:final",
  event_name: "Design specimen",
  team1_name: "A very long international Counter-Strike team name",
  team2_name: "Second team",
  status: "finished",
  score1: 0,
  score2: 2,
  series_format: "bo3",
  match_date: "2026-11-01",
};

export function Showcase() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="showcase">
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>StrikeSignal interface system</h1>
          <p>Circuit: shared components, spacing and tested product states.</p>
        </div>
        <Badge variant="secondary">React · TypeScript · shadcn</Badge>
      </header>
      <section>
        <h2>Foundations</h2>
        <p>
          Blue-slate surfaces, local Sora and an orange signal for forecasts and
          winners.
        </p>
        <div className="swatches">
          {[
            ["Page", "background", "foreground"],
            ["Panel", "card", "card-foreground"],
            ["Overlay", "popover", "popover-foreground"],
            ["Secondary action", "secondary", "secondary-foreground"],
            ["Interactive accent", "accent", "accent-foreground"],
            ["Muted", "muted", "muted-foreground"],
            ["Primary action", "primary", "primary-foreground"],
            ["Data accent", "background", "signal"],
            ["Error text", "background", "destructive"],
          ].map(([name, background, foreground]) => (
            <ColorPair
              key={name}
              name={name}
              background={background}
              foreground={foreground}
            />
          ))}
        </div>
        <div className="type-specimens">
          <h3>Who has the edge?</h3>
          <p>
            Verified results, model estimates and missing evidence each have
            their own place.
          </p>
          <span className="subline">
            Source checked 1 November · Statistics retain their own date.
          </span>
          <div className="probability-specimen">
            <span>Spirit</span>
            <strong>62.4%</strong>
            <div>
              <span style={{ width: "62.4%" }} />
            </div>
            <span>Model estimate · example composition</span>
          </div>
        </div>
      </section>
      <section>
        <h2>Geometry and motion</h2>
        <div className="sample-grid">
          {[
            [4, "Chips"],
            [6, "Controls"],
            [8, "Panels"],
          ].map(([radius, label]) => (
            <div
              key={label}
              className="sample-panel"
              style={{ borderRadius: Number(radius) }}
            >
              {label} · {radius}px radius
            </div>
          ))}
        </div>
        <p>
          Spacing: 4px base · 16px between related controls · 32px between
          sections. Flat canvas, neutral rules, floating overlays.
        </p>
        <p>
          Pointer feedback: 150ms ease-out. Keyboard actions respond
          immediately. Reduced motion removes positional transitions.
        </p>
        <div className="component-row">
          <Search size={16} />
          <Search size={20} />
          <Search size={24} />
          <span>Lucide · 16 / 20 / 24px</span>
        </div>
      </section>
      <section>
        <h2>Actions and states</h2>
        <div
          className="matrix-scroll"
          role="region"
          aria-label="Button state matrix"
          tabIndex={0}
        >
          <StateMatrix
            rows={
              [
                "default",
                "outline",
                "secondary",
                "ghost",
                "destructive",
                "link",
              ] as const
            }
            states={[
              "default",
              "hover",
              "focus",
              "active",
              "disabled",
              "loading",
            ]}
            render={(variant, state) => (
              <Button
                variant={variant}
                {...previewState(state)}
                disabled={state === "disabled" || state === "loading"}
                aria-busy={state === "loading"}
              >
                {state === "loading" ? (
                  <>
                    <RefreshCw />
                    Refresh
                  </>
                ) : (
                  "View match"
                )}
              </Button>
            )}
          />
        </div>
        <div className="component-row">
          <Button size="sm">
            <Check data-icon="inline-start" />
            Save pick
          </Button>
          <Button variant="outline" size="lg">
            Open match
            <ArrowUpRight data-icon="inline-end" />
          </Button>
          <Badge variant="secondary">Published result</Badge>
          <Badge variant="outline">Model estimate</Badge>
          <Avatar>
            <AvatarFallback>SS</AvatarFallback>
          </Avatar>
        </div>
      </section>
      <section>
        <h2>Inputs</h2>
        <div
          className="matrix-scroll"
          role="region"
          aria-label="Input state matrix"
          tabIndex={0}
        >
          <StateMatrix
            rows={["Player search"]}
            states={["default", "hover", "focus", "disabled", "invalid"]}
            render={(_, state) => (
              <Input
                aria-label={"Player search, " + state + " example"}
                placeholder="ZywOo"
                aria-invalid={state === "invalid" || undefined}
                {...previewState(state)}
              />
            )}
          />
        </div>
        <div className="sample-grid">
          <Field>
            <FieldLabel htmlFor="search-example">Find a player</FieldLabel>
            <Input id="search-example" placeholder="Name or team" />
            <FieldDescription>
              Search the supported player catalogue.
            </FieldDescription>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="invalid-example">Event name</FieldLabel>
            <Input
              id="invalid-example"
              aria-invalid="true"
              aria-describedby="invalid-example-help"
              defaultValue=""
            />
            <FieldError id="invalid-example-help">
              Enter a tournament name.
            </FieldError>
          </Field>
          <Field data-disabled>
            <FieldLabel htmlFor="disabled-example">Verified result</FieldLabel>
            <Input
              id="disabled-example"
              disabled
              value="Awaiting source confirmation"
              readOnly
            />
            <FieldDescription>
              A past start time does not prove a result.
            </FieldDescription>
          </Field>
          <Field>
            <Label htmlFor="appearance-example">Match status</Label>
            <Select
              defaultValue="all"
              items={{
                all: "All matches",
                upcoming: "Upcoming",
                finished: "Results",
              }}
            >
              <SelectTrigger id="appearance-example">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All matches</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="finished">Results</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>
      <section>
        <h2>Navigation and overlays</h2>
        <Tabs defaultValue="matches">
          <TabsList aria-label="Example event views">
            <TabsTrigger value="matches">Matches</TabsTrigger>
            <TabsTrigger value="tree">Tournament path</TabsTrigger>
          </TabsList>
          <TabsContent value="matches">
            <p className="sample-panel">
              Verified fixtures and results share one timeline.
            </p>
          </TabsContent>
          <TabsContent value="tree">
            <p className="sample-panel">Unconfirmed pairings remain TBD.</p>
          </TabsContent>
        </Tabs>
        <div className="component-row">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
              Open match details
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Match evidence</DialogTitle>
              <DialogDescription>
                Results come from the published source. Estimates come from the
                model. A missing value stays unavailable.
              </DialogDescription>
              <p>Escape closes this view and returns focus to its trigger.</p>
            </DialogContent>
          </Dialog>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" />}>
              <Search data-icon="inline-start" />
              Search help
            </TooltipTrigger>
            <TooltipContent>
              Search by team, player or event name.
            </TooltipContent>
          </Tooltip>
          <Button
            aria-busy={busy}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => setBusy(false), 900);
            }}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh example
          </Button>
        </div>
      </section>
      <section>
        <h2>Feedback</h2>
        <div className="sample-grid">
          <Alert>
            <AlertTitle>Snapshot available</AlertTitle>
            <AlertDescription>
              Statistics retain their original source dates.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Refresh unavailable</AlertTitle>
            <AlertDescription>
              The last verified data stays visible. Check your connection and
              try again.
            </AlertDescription>
          </Alert>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>The draw is not confirmed</EmptyTitle>
              <EmptyDescription>
                Published pairings will appear after the next verified update.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
          <div
            className="sample-panel"
            role="status"
            aria-busy="true"
            aria-label="Loading match"
          >
            <Skeleton className="h-5 w-40" />
            <Separator />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      </section>
      <section>
        <h2>Evidence language: do and don't</h2>
        <div className="sample-grid">
          <div className="sample-panel">
            <h3>Do</h3>
            <p>Rating 1.21 · 43 maps · statistics through 23 October.</p>
            <p>
              Unknown score: —. Unconfirmed pairing: TBD. Original crest or
              initials.
            </p>
          </div>
          <div className="sample-panel">
            <h3>Don't</h3>
            <p>
              Call an old sample current, use 0 for a missing score, advance a
              predicted winner as a real result, or flatten artwork with
              brightness filters.
            </p>
          </div>
        </div>
      </section>
      <section data-testid="product-specimens">
        <h2>Product geometry and boundary states</h2>
        <p>
          Layout specimens use fictional teams. These are the same series
          component and bracket renderer used in events.
        </p>
        <div className="match-grid">
          <Series match={specimen} data={specimenData} />
          <Series
            match={{
              ...specimen,
              match_id: "specimen:pending",
              status: "upcoming",
              score1: undefined,
              score2: undefined,
            }}
            data={specimenData}
          />
          <Series
            match={{
              ...specimen,
              match_id: "specimen:draw",
              team1_name: "TBD",
              team2_name: "TBD",
            }}
            data={specimenData}
            formatGuide
          />
        </div>
        <div
          className="bracket-viewport"
          role="region"
          aria-label="Bracket layout specimen"
          tabIndex={0}
        >
          <BracketLane
            lane={{
              id: "specimen",
              label: "Connected path · fictional results",
              rounds: [
                {
                  id: "sf",
                  label: "Semifinals",
                  matches: [
                    { ...specimen, match_id: "specimen:a" },
                    {
                      ...specimen,
                      match_id: "specimen:b",
                      team1_name: "Third team",
                      team2_name: "Fourth team",
                    },
                  ],
                },
                {
                  id: "gf",
                  label: "Grand final",
                  matches: [
                    {
                      ...specimen,
                      match_id: "specimen:c",
                      team1_name: "Second team",
                      team2_name: "Fourth team",
                      feeds_from: ["specimen:a", "specimen:b"],
                    },
                  ],
                },
              ],
            }}
            renderSeries={(m) => <Series match={m} data={specimenData} />}
          />
        </div>
      </section>
      <section>
        <h2>Long names and missing media</h2>
        <div className="sample-panel">
          <p>Intel Extreme Masters Cologne Major 2026 Stage 2</p>
          <p>A longer tournament name wraps without hiding its action.</p>
          <div className="component-row">
            <Avatar>
              <AvatarFallback>SA</AvatarFallback>
            </Avatar>
            <span>Spirit Academy</span>
            <Button variant="outline">View team</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
