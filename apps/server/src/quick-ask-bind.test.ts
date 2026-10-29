import { describe, expect, test } from "bun:test";
import { withQuickAskBind } from "./app";

describe("Ctrl+Space on Wayland", () => {
  const app = "/home/a/Applications/Igrek.AppImage";
  test("Hyprland and Sway get the line for their config, with this copy's path", () => {
    expect(withQuickAskBind({ APPIMAGE: app, XDG_SESSION_TYPE: "wayland", XDG_CURRENT_DESKTOP: "Hyprland" })).toEqual({
      quickAskBind: `bind = CTRL, SPACE, exec, ${app} --quick-ask`,
    });
    expect(withQuickAskBind({ APPIMAGE: app, WAYLAND_DISPLAY: "wayland-1", XDG_CURRENT_DESKTOP: "sway" })).toEqual({
      quickAskBind: `bindsym ctrl+space exec ${app} --quick-ask`,
    });
  });
  test("nothing on X11, outside the AppImage or on desktops that bind it another way", () => {
    expect(withQuickAskBind({ APPIMAGE: app, XDG_SESSION_TYPE: "x11", XDG_CURRENT_DESKTOP: "Hyprland" })).toEqual({});
    expect(withQuickAskBind({ XDG_SESSION_TYPE: "wayland", XDG_CURRENT_DESKTOP: "Hyprland" })).toEqual({});
    expect(withQuickAskBind({ APPIMAGE: app, XDG_SESSION_TYPE: "wayland", XDG_CURRENT_DESKTOP: "GNOME" })).toEqual({});
  });
});
