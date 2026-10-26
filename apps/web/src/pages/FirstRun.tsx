import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Onboarding } from "./Onboarding";

/**
 * The wizard sits in a router of its own, kept in memory so the address stays as it is: parts it shares
 * with the app's pages (the install buttons) use the router, and without one they would throw. It is
 * loaded only on the first run, so everyone else's first screen does not carry it.
 */
export function FirstRun() {
  const [wizard] = useState(() => createMemoryRouter([{ path: "*", element: <Onboarding /> }]));
  return <RouterProvider router={wizard} />;
}
