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
