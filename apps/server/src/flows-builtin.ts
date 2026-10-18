/**
 * Built-in flows (plan.md Faz 8), in the same YAML format a project can put in .godeye/flows/
 * (or Archon's .archon/workflows/). $REQUEST is what the user asked; $<node>.output is an
 * earlier node's result; $FEEDBACK is what went wrong when a node is sent back.
 */
export const BUILTIN_FLOWS: Record<string, string> = {
  feature: `name: feature
description: "The team lead plans, the architect designs and the plan waits for you; backend and frontend build side by side in their own copies; the project's checks and QA must pass (or the work goes back); security and DevOps review; the team lead sums up for one final approval."
nodes:
  - id: plan
    title: Plan
    persona: pm-lead
    prompt: |
      The user asked the team for: $REQUEST
      Read the project and split this into small tasks. Write: the goal in one sentence, "Backend tasks", "Frontend tasks" (write "none" if a side has nothing to do), and "Done when" acceptance criteria that can be checked. Do not change any files.
      $FEEDBACK
  - id: design
    title: Design
    persona: architect
    depends_on: [plan]
    prompt: |
      Turn the team lead's plan into a design the developers can follow: data model changes, API shape, the files to create or change, and the main risks. Keep it as small as the request allows. Do not change any files.
      Request: $REQUEST
      Plan: $plan.output
      $FEEDBACK
  - id: approve-plan
    title: Your OK on the plan
    depends_on: [design]
    wait:
      attention: Check the plan and design before the team writes code. Approve, or send it back with what to change.
    on_fail: { back_to: [plan, design], max: 3 }
  - id: backend
    title: Backend
    persona: backend
    depends_on: [approve-plan]
    worktree: own
    prompt: |
      Do the backend tasks of this design (server, API, database, tests). If there are none, change nothing and say so. Add or update tests for what you change and run them.
      Request: $REQUEST
      Design: $design.output
      $FEEDBACK
  - id: frontend
    title: Frontend
    persona: frontend
    depends_on: [approve-plan]
    worktree: own
    prompt: |
      Do the frontend tasks of this design (screens, components, texts). If there are none, change nothing and say so. Match the existing style of the app.
      Request: $REQUEST
      Design: $design.output
      $FEEDBACK
  - id: checks
    title: Build and tests
    depends_on: [backend, frontend]
    checks: true
    on_fail: { back_to: [backend, frontend], max: 2 }
  - id: qa
    title: QA
    persona: qa
    depends_on: [checks]
    review: true
    on_fail: { back_to: [backend, frontend], max: 2 }
    prompt: |
      Check the team's work against the plan's "Done when" criteria. Read the changed files, run what you can, and look for missing cases. Do not change files.
      Request: $REQUEST
      Plan: $plan.output
      Backend said: $backend.output
      Frontend said: $frontend.output
  - id: security
    title: Security review
    persona: security
    depends_on: [qa]
    review: true
    prompt: |
      Review the changes on this branch for security problems (run git diff against the base to see them): authentication, authorization, input handling, secrets, dependencies. Report by importance.
      Request: $REQUEST
  - id: devops
    title: DevOps review
    persona: devops
    depends_on: [qa]
    review: true
    prompt: |
      Review the changes on this branch for running them in production (run git diff against the base to see them): configuration, migrations, environment variables, rollback. Report by importance.
      Request: $REQUEST
  - id: summary
    title: Summary for you
    persona: pm-lead
    depends_on: [security, devops]
    prompt: |
      Write the summary the user reads before approving: what was built, how it was checked (build, tests, QA), what security and DevOps found, and anything they must do by hand. Short, plain words. Do not change files.
      Request: $REQUEST
      Backend: $backend.output
      Frontend: $frontend.output
      Checks: $checks.output
      QA: $qa.output
      Security: $security.output
      DevOps: $devops.output
`,
  spec: `name: spec
description: "Spec first: requirements, design, then tasks with acceptance criteria are written into docs/specs and wait for your OK; only then the team codes, and QA checks every acceptance criterion before you approve."
nodes:
  - id: requirements
    title: Requirements
    persona: product-manager
    prompt: |
      The user wants: $REQUEST
      Read the project first. Pick a short kebab-case name for this feature and create docs/specs/<name>/requirements.md with: the problem in two sentences, who it is for, user stories, numbered requirements written as "WHEN … THE SYSTEM SHALL …", what is out of scope, and open questions. Write only that file.
      End your answer with the line: SPEC: docs/specs/<name>
      $FEEDBACK
  - id: design
    title: Design
    persona: architect
    depends_on: [requirements]
    prompt: |
      Read the requirements ($requirements.output) and write design.md in the same folder: data model changes, API shape, the files to create or change, how each numbered requirement is met, risks and alternatives you rejected. Keep it as small as the requirements allow. Write only that file.
      $FEEDBACK
  - id: tasks
    title: Tasks and acceptance criteria
    persona: pm-lead
    depends_on: [design]
    prompt: |
      From requirements.md and design.md in that folder ($requirements.output), write tasks.md: small numbered tasks in order (each names the files it touches and the requirement numbers it covers), then "Acceptance criteria" as a checklist of "- [ ]" items a tester can check one by one. Write only that file.
      $FEEDBACK
  - id: approve-spec
    title: Your OK on the spec
    depends_on: [tasks]
    wait:
      attention: Read requirements.md, design.md and tasks.md in docs/specs. Approve to start coding, or send it back with what to change.
    on_fail: { back_to: [requirements, design, tasks], max: 3 }
  - id: backend
    title: Backend
    persona: backend
    depends_on: [approve-spec]
    worktree: own
    prompt: |
      Do the backend and data tasks of tasks.md in the spec folder ($requirements.output), in order, with tests. If none are yours, change nothing and say so.
      $FEEDBACK
  - id: frontend
    title: Frontend
    persona: frontend
    depends_on: [approve-spec]
    worktree: own
    prompt: |
      Do the frontend tasks of tasks.md in the spec folder ($requirements.output), in order, matching the app's style. If none are yours, change nothing and say so.
      $FEEDBACK
  - id: checks
    title: Build and tests
    depends_on: [backend, frontend]
    checks: true
    on_fail: { back_to: [backend, frontend], max: 2 }
  - id: acceptance
    title: Acceptance check
    persona: qa
    depends_on: [checks]
    review: true
    on_fail: { back_to: [backend, frontend], max: 2 }
    prompt: |
      Go through every acceptance criterion in tasks.md of the spec folder ($requirements.output). For each, check the code (and run what you can), then mark it "- [x]" in tasks.md if it is met; leave "- [ ]" and say why if not. Change only tasks.md.
  - id: summary
    title: Summary for you
    persona: pm-lead
    depends_on: [acceptance]
    prompt: |
      Write the summary the user reads before approving: which requirements are done, which acceptance criteria passed or not, what the checks said, and what is left. Short, plain words. Do not change files.
      Request: $REQUEST
      Acceptance: $acceptance.output
      Checks: $checks.output
`,
  fix: `name: fix
description: "A developer finds and fixes a bug in its own copy; the checks must pass; QA confirms; you approve."
nodes:
  - id: fix
    title: Fix
    persona: backend
    prompt: |
      Find the cause of this problem and fix it with the smallest change. Add a test that fails without the fix.
      Problem: $REQUEST
      $FEEDBACK
  - id: checks
    title: Build and tests
    depends_on: [fix]
    checks: true
    on_fail: { back_to: [fix], max: 2 }
  - id: qa
    title: QA
    persona: qa
    depends_on: [checks]
    review: true
    on_fail: { back_to: [fix], max: 2 }
    prompt: |
      Confirm the problem is fixed and nothing nearby broke. Do not change files.
      Problem: $REQUEST
      Developer said: $fix.output
`,
  careful: `name: careful
description: "Explore, plan, critique, work, review: an explorer maps the code (reads only), a planner writes the steps, a critic attacks the plan before any code is written (it goes back until it holds), you approve, a developer does it in its own copy, the checks must pass and QA reviews the result."
nodes:
  - id: explore
    title: Explore
    persona: architect
    prompt: |
      Map the parts of the project this request touches, before anyone plans: the entry points, the files and functions involved (path and one line each), how data flows through them, the tests that cover them and the conventions the code follows. Read only; do not change any files.
      Request: $REQUEST
  - id: plan
    title: Plan
    persona: pm-lead
    depends_on: [explore]
    prompt: |
      Write the plan from this map: the steps in order, the exact files each step changes, the tests to add, and "Done when" criteria that can be checked. The smallest change that does the job. Do not change any files.
      Request: $REQUEST
      Map of the code: $explore.output
      $FEEDBACK
  - id: critique
    title: Critique
    persona: devils-advocate
    depends_on: [plan]
    review: true
    on_fail: { back_to: [plan], max: 2 }
    prompt: |
      Attack this plan before any code is written: missing cases, wrong files, a simpler way, risks to what already works, tests that would not catch the bug. FAIL only for problems that would make the work wrong.
      Request: $REQUEST
      Map of the code: $explore.output
      Plan: $plan.output
  - id: approve
    title: Your OK on the plan
    depends_on: [critique]
    wait:
      attention: The plan held up against the critic. Approve it before code is written, or send it back.
    on_fail: { back_to: [plan], max: 3 }
  - id: work
    title: Work
    persona: backend
    depends_on: [approve]
    worktree: own
    prompt: |
      Carry out the approved plan exactly; add the tests it lists and run them.
      Request: $REQUEST
      Plan: $plan.output
      Critic's notes: $critique.output
      $FEEDBACK
  - id: checks
    title: Build and tests
    depends_on: [work]
    checks: true
    on_fail: { back_to: [work], max: 2 }
  - id: review
    title: Review
    persona: qa
    depends_on: [checks]
    review: true
    on_fail: { back_to: [work], max: 2 }
    prompt: |
      Review the change against the plan's "Done when" criteria and the critic's notes. Do not change files.
      Plan: $plan.output
      Developer said: $work.output
`,
  cleanup: `name: cleanup
description: "Safe cleanup: the checks must pass before anything is touched, an explorer lists dead code with evidence (reads only), you pick what goes, a cleaner removes it in its own copy with one commit per removal (each can be reverted alone), the same checks must pass again and QA confirms nothing a user could notice changed."
nodes:
  - id: before
    title: Checks before
    checks: true
  - id: find
    title: Find dead code
    persona: architect
    depends_on: [before]
    prompt: |
      List code this project no longer uses: files, exports, functions, variables, dependencies, env keys, CSS classes, routes and feature flags. For each: the path, what it is, and the evidence it is unused (the search you ran and found nothing, or the output of the project's own dead-code tool if it has one configured, like knip, vulture, staticcheck or clippy; do not install tools). Leave out anything that may be used by name from outside the code (public API, plugin entry points, routes called by clients, config read by tools, dynamic imports, reflection) and say you left it out. Number the list. Read only; do not change any files.
      Focus, if given: $REQUEST
      $FEEDBACK
  - id: pick
    title: Your pick
    depends_on: [find]
    wait:
      attention: Check the list. Approve to remove all of it, or send it back with the numbers to keep.
    on_fail: { back_to: [find], max: 3 }
  - id: clean
    title: Clean
    persona: backend
    depends_on: [pick]
    worktree: own
    prompt: |
      Remove exactly the items on this approved list, nothing else, and change no behavior. Commit each removal on its own with git commit -m "Remove <what>: <why it is safe>" so each one can be reverted alone. Do not edit tests to make them pass; if removing something breaks a test, it was not dead: put it back and say so.
      List: $find.output
      $FEEDBACK
  - id: after
    title: Same checks after
    depends_on: [clean]
    checks: true
    on_fail: { back_to: [clean], max: 2 }
  - id: review
    title: Nothing changed for users
    persona: qa
    depends_on: [after]
    review: true
    on_fail: { back_to: [clean], max: 1 }
    prompt: |
      Confirm the cleanup changed no behavior: only listed items were removed, no public API, route, config key or user-visible text went away, no test was weakened or deleted. Run git log on this branch to see each removal. Do not change files.
      List: $find.output
      Cleaner said: $clean.output
`,
  task: `name: task
description: "One AI step does the job in its own copy; if it changed code, the project's checks must pass."
nodes:
  - id: do
    title: Do it
    prompt: |
      $REQUEST
      $FEEDBACK
  - id: checks
    title: Build and tests
    depends_on: [do]
    checks: true
    on_fail: { back_to: [do], max: 1 }
`,
  check: `name: check
description: "Night check: the project's build and tests, and a security review of the code."
nodes:
  - id: security
    title: Security review
    persona: security
    review: true
    prompt: |
      Do a short security check of this project as it is now: secrets in the code, risky dependencies, missing authorization, injection. Report only what matters, by importance.
      $REQUEST
  - id: checks
    title: Build and tests
    depends_on: [security]
    checks: true
`,
  deps: `name: deps
description: "Dependency update: patch and minor versions, tests run; major versions are only listed."
nodes:
  - id: update
    title: Update dependencies
    persona: devops
    prompt: |
      Update this project's dependencies to the newest versions that are compatible (patch and minor only; list major upgrades without doing them). Use the project's package manager, keep the lockfile consistent, and run the tests. Say exactly what changed.
      $REQUEST
      $FEEDBACK
  - id: checks
    title: Build and tests
    depends_on: [update]
    checks: true
    on_fail: { back_to: [update], max: 1 }
`,
  report: `name: report
description: "A short report on the project, read only: what changed, what is open, what needs attention."
nodes:
  - id: report
    title: Report
    persona: chief-of-staff
    review: false
    prompt: |
      Write a short report on this project for its owner: what changed recently (look at git log), what looks unfinished, and what needs attention first. Do not change any files.
      $REQUEST
`,
};
