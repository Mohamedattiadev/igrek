import type { ProjectListItem } from "@igrek/core";
import { BriefingCard } from "./BriefingCard";
import { FocusBanner } from "./FocusBanner";
import { RecapCard } from "./RecapCard";

/** The day's cards on the home page: the briefing and the day's end side by side, then focus. */
export function DayCards({ projects, onChange }: { projects: ProjectListItem[]; onChange: () => void }) {
  return (
    <>
      <BriefingCard />
      <RecapCard />
      <div className="md:col-span-2">
        <FocusBanner projects={projects} onChange={onChange} />
      </div>
    </>
  );
}
