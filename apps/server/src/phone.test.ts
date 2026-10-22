import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { checkScreen, findApks, Phone, parseDevices } from "./phone";

describe("testing on the user's own phone", () => {
  test("adb's device list becomes phones with their state", () => {
    expect(
      parseDevices(
        "List of devices attached\nR5CT30 device usb:1-1 product:a52 model:SM_A525F device:a52 transport_id:2\n192.168.1.5:41235 unauthorized\n",
      ),
    ).toEqual([
      { serial: "R5CT30", state: "ready", model: "SM A525F", wifi: false },
      { serial: "192.168.1.5:41235", state: "unauthorized", model: undefined, wifi: true },
    ]);
  });

  test("small touch targets and unnamed buttons are found in dp, a named one is fine", () => {
    const xml = `<?xml version="1.0"?><hierarchy>
<node class="android.widget.ImageButton" resource-id="app:id/menu" clickable="true" text="" content-desc="" bounds="[0,0][84,84]">
</node>
<node class="android.widget.Button" resource-id="app:id/send" clickable="true" text="Send" content-desc="" bounds="[100,100][400,300]">
</node>
<node class="android.widget.FrameLayout" resource-id="app:id/card" clickable="true" text="" content-desc="" bounds="[0,400][1080,700]">
<node class="android.widget.TextView" text="Order 12" content-desc="" clickable="false" bounds="[20,420][500,480]" />
</node></hierarchy>`;
    // At 420 dpi, 84 px is 32 dp: too small for a finger.
    const found = checkScreen(xml, 420);
    expect(found.small.map((s) => [s.id, s.width])).toEqual([["app:id/menu", 32]]);
    expect(found.unnamed.map((u) => u.id)).toEqual(["app:id/menu"]);
  });

  test("only APKs a build made are offered, newest first, never one in node_modules", () => {
    const root = mkdtempSync(join(tmpdir(), "igrek-apk-"));
    for (const dir of ["android/app/build/outputs/apk/debug", "node_modules/x/build"])
      mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "android/app/build/outputs/apk/debug/app-debug.apk"), "x");
    writeFileSync(join(root, "node_modules/x/build/other.apk"), "x");
    writeFileSync(join(root, "random.apk"), "x");
    expect(findApks(root).map((p) => relative(root, p))).toEqual(["android/app/build/outputs/apk/debug/app-debug.apk"]);
  });

  test("without adb it says so, and a phone id that is not one is refused before adb runs", async () => {
    const calls: string[][] = [];
    const missing = new Phone(async (args) => {
      calls.push(args);
      return { code: 127, out: Buffer.alloc(0), err: "" };
    });
    expect(await missing.devices()).toEqual({ adb: false, devices: [] });
    await expect(missing.tap("R5CT30; rm -rf /", 1, 1)).rejects.toThrow("Unknown phone");
    expect(calls).toEqual([["devices", "-l"]]);
  });
});
