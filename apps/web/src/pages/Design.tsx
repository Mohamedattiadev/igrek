import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Kbd, PageHeader, Section, Segmented, StatusDot } from "../components/ui";

const SWATCHES = ["bg", "bg-subtle", "bg-muted", "border", "fg", "fg-muted", "accent", "success", "warning", "danger"];

/** Design-system showcase (plan.md 7.1): every building block on one page. */
export function DesignPage() {
  const [segment, setSegment] = useState("one");
  return (
    <>
      <PageHeader title="Design system" />
      <div className="mx-auto w-full max-w-4xl px-6">
        <Section title="Colors" hint="Neutral grays and a single accent. Color only when it means something.">
          <div className="grid grid-cols-5 gap-2">
            {SWATCHES.map((name) => (
              <div key={name} className="text-[11px] text-fg-subtle">
                <div className="mb-1 h-10 rounded-md border border-border" style={{ background: `var(--${name})` }} />
                {name}
              </div>
            ))}
          </div>
        </Section>
        <Section title="Typography">
          <p className="text-[18px] font-semibold">Page title — Inter 18 semibold</p>
          <p className="text-[14px] font-semibold">Section title — Inter 14 semibold</p>
          <p className="text-[13px] text-fg-muted">Body text — Inter 13, muted for secondary information.</p>
          <p className="font-mono text-xs text-fg-subtle">const code = "JetBrains Mono";</p>
        </Section>
        <Section title="Buttons" hint="At most one primary action per screen.">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Plus}>
              Primary
            </Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" icon={Trash2}>
              Danger
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>
        <Section title="Badges & status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <span className="ms-3 flex items-center gap-3">
              <StatusDot tone="success" pulse />
              <StatusDot tone="warning" />
              <StatusDot tone="danger" />
              <StatusDot tone="neutral" />
            </span>
          </div>
        </Section>
        <Section title="Controls">
          <div className="flex flex-wrap items-center gap-4">
            <Segmented
              value={segment}
              onChange={setSegment}
              options={[
                { value: "one", label: "One" },
                { value: "two", label: "Two" },
                { value: "three", label: "Three" },
              ]}
            />
            <span className="flex gap-1">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
        </Section>
        <Section title="List" hint="Rows follow the density setting. Try j/k in Vim mode.">
          <Card>
            <ul className="divide-y divide-border">
              {["PoultryCare", "God Eye", "Landing page"].map((name) => (
                <li
                  key={name}
                  data-nav-item
                  tabIndex={-1}
                  className="flex h-row items-center gap-3 px-3 text-[13px] outline-none"
                >
                  <StatusDot tone="success" />
                  <span className="flex-1 font-medium">{name}</span>
                  <Badge tone="accent">A · 92</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
        <Section title="Empty state">
          <Card>
            <EmptyState
              icon={FolderKanban}
              title="Nothing here yet"
              body="Every empty screen tells you how to start."
            />
          </Card>
        </Section>
      </div>
    </>
  );
}
