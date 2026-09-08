# whatsapp-tag-all

Browser-console script for WhatsApp Web that fills the compose box with an
@mention for every member of the currently open group, followed by a message.

It never sends. You review the compose box and press send yourself.

## Usage

1. Open https://web.whatsapp.com in Chrome and log in.
2. Click the group in the sidebar so the conversation is open.
3. Open DevTools (F12 or Cmd+Opt+I) and go to the Console tab.
   If you see "Don't paste code here", type `allow pasting`.
4. Edit `MESSAGE` at the top of `whatsapp-tag-all.js`.
5. Paste the whole file into the console and press Enter.
6. Wait a few seconds, check the `[tagall]` log lines name the right group,
   then review the compose box and send it yourself.

See the header comment in `whatsapp-tag-all.js` for details.
