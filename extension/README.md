# Igrek browser extension

For forms (job and scholarship applications, company paperwork): fill the fields that ask for your
private details, and have a field's text written, without the AI ever seeing those details.

- Acts on the page with you: ask about it, pick an element and ask about that, or say what to do.
  Igrek proposes up to five steps (click, type, choose, scroll); each is outlined on the page and done
  only when you click "Do it". A step that sends, pays, deletes or publishes asks a second time. Text on
  the page is read as data, never as instructions, and password fields are never typed into.
- Works only on the tab you opened the panel on: after the page changes, click the toolbar icon again.
- Works in Chrome, Brave and Edge (Manifest V3, side panel).
- Talks only to Igrek on this computer (`http://localhost`), with a pairing key made in Igrek.
- Private values go from Igrek straight into the page; the AI that writes a text sees
  `[[private:name]]` placeholders, and Igrek puts the values in before the text reaches the page.

## Install (until it is in a store)

1. Open `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`).
2. Turn on "Developer mode", choose "Load unpacked" and pick this `extension` folder.
3. In the extension's panel press "Connect": Igrek (open on this computer) shows the same six-digit
   code; press "Allow" there. (Or make a pairing key in Igrek's Settings and paste it.)

Under the Igrek Use License (`../LICENSE`).
