/* ==================================================================
   WhatsApp Web — Tag Every Group Member
   ------------------------------------------------------------------
   Fills the compose box with an @mention for every member of a group,
   followed by your message.

   IT NEVER SENDS. There is no Enter keypress and no send-button click
   anywhere in this file. You review the box and press send yourself.

   The group is detected automatically from whichever conversation you
   have open — no group name to configure. Open a group, run, done.

   HOW TO RUN
   1. Open https://web.whatsapp.com in Chrome and log in.
   2. Click the group in the sidebar so the conversation is open.
      (Important — the participant list only loads once you open it.)
   3. Press F12 (or Cmd+Opt+I) -> "Console" tab.
      If you see "Don't paste code here", type: allow pasting
   4. Edit MESSAGE below. That is the only required setting.
   5. Paste this entire file into the console and press Enter.
   6. Wait ~5-10 seconds. Watch the green [tagall] log lines — the first
      one names the group it detected. Check that it is the right one.
   7. Review the compose box, then hit send yourself.

   To do a second group: open it, paste the script again. Nothing to edit.
   ================================================================== */

(async () => {
  /* ------------------------- CONFIG ------------------------- */
  const MESSAGE    = 'help kids who really need your help';
  const CLEAR_BOX  = true;   // wipe whatever is already in the compose box first
  const GROUP_NAME = null;   // leave null to auto-detect the open group.
                             // Set a string only to force a specific group.
  /* ---------------------------------------------------------- */

  const log   = (...a) => console.log('%c[tagall]', 'color:#25d366;font-weight:bold', ...a);
  const warn  = (...a) => console.warn('[tagall]', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- 1. Grab the compose box (also proves a chat is open) ---- */
  const input = document.querySelector('[data-testid="conversation-compose-box-input"]')
             || document.querySelector('div[contenteditable="true"][data-tab="10"]');
  if (!input) throw new Error('No open conversation — click a group in the sidebar first.');

  /* ---- 2. Work out WHICH chat is open, without hardcoding it ----
     Three independent strategies, cheapest first. Each returns a chat
     model from ChatCollection so the rest of the script is identical. */
  const { ChatCollection } = window.require('WAWebChatCollection');
  const byId = id => ChatCollection._models.find(m => m && m.id && m.id._serialized === id);

  // (a) React fiber: walk up from the compose box looking for any prop
  //     that carries a chat-shaped object. Most reliable — it is the
  //     actual model the open conversation was rendered from.
  function detectViaFiber() {
    const fk = Object.keys(input).find(k => k.startsWith('__reactFiber'));
    if (!fk) return null;
    let n = input[fk];
    for (let d = 0; d < 400 && n; d++, n = n.return) {
      const p = n.memoizedProps;
      if (!p) continue;
      for (const key in p) {
        const v = p[key];
        if (v && typeof v === 'object' && v.id && typeof v.id._serialized === 'string'
            && v.id._serialized.endsWith('@g.us')) {
          return byId(v.id._serialized) || v;
        }
      }
    }
    return null;
  }

  // (b) URL hash — WhatsApp writes the open chat id there in most builds.
  function detectViaHash() {
    const m = (location.hash || '').match(/(\d+(?:-\d+)?@g\.us)/);
    return m ? byId(m[1]) : null;
  }

  // (c) Header title text -> match against the collection. Last resort,
  //     because two groups can share a name.
  function detectViaHeader() {
    const el = document.querySelector('header [title], header span[dir="auto"]');
    const title = el && (el.getAttribute('title') || el.textContent || '').trim();
    if (!title) return null;
    const hits = ChatCollection._models.filter(m =>
      m && m.id && m.id._serialized.endsWith('@g.us') &&
      ((m.name || m.formattedTitle || '').trim() === title));
    if (hits.length > 1) warn(`${hits.length} groups named "${title}" — using the first.`);
    return hits[0] || null;
  }

  let group, how;
  if (GROUP_NAME) {
    group = ChatCollection._models.find(m =>
      m && ((m.name || m.formattedTitle || '') === GROUP_NAME));
    how = 'GROUP_NAME override';
    if (!group) throw new Error(`Group "${GROUP_NAME}" not found.`);
  } else {
    const tries = [['fiber', detectViaFiber], ['url hash', detectViaHash], ['header title', detectViaHeader]];
    for (const [label, fn] of tries) {
      try { const g = fn(); if (g) { group = g; how = label; break; } }
      catch (e) { warn(`detect via ${label} failed:`, e.message); }
    }
  }

  if (!group) throw new Error('Could not identify the open chat. Set GROUP_NAME manually at the top.');

  const groupTitle = group.name || group.formattedTitle || (group.id && group.id._serialized);
  if (!group.id || !group.id._serialized.endsWith('@g.us'))
    throw new Error(`"${groupTitle}" is a 1-on-1 chat, not a group. Open a group and rerun.`);
  if (!group.groupMetadata)
    throw new Error('Participant list not loaded yet. Scroll the group once, then rerun.');

  log(`detected via ${how}: "${groupTitle}"`);

  /* ---- 3. Read the participant roster ---- */
  let myId = '';
  try { myId = window.require('WAWebUserPrefsMeUser').getMeUser()._serialized; } catch (e) {}

  const roster = group.groupMetadata.participants._models.map((p, i) => {
    const c = p.contact || {};
    const name = p.pushname || c.name || c.pushname || c.formattedName || c.verifiedName;
    // Fallback label for members who have no name saved. Cosmetic only —
    // the notification is driven by `wid`, not by the visible text.
    const fallback = '~' + ((c.id && c.id.user) || (p.id && p.id.user) || ('member' + i));
    return { lid: p.id ? p.id._serialized : null, name: name || fallback };
  }).filter(p => p.lid);

  log(`${roster.length} participants`);

  input.focus();
  await sleep(150);
  if (CLEAR_BOX) {
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await sleep(200);
  }

  /* ---- 4. Bootstrap: tag ONE member through the real dropdown ----
     WhatsApp's mention node class isn't exported anywhere, so we make
     the app build one genuine mention for us and read the class off it. */
  document.execCommand('insertText', false, '@');
  await sleep(1200);
  let items = document.querySelectorAll('[data-testid="contact-mention-list-item"]');
  if (!items.length) { await sleep(1500); items = document.querySelectorAll('[data-testid="contact-mention-list-item"]'); }
  if (!items.length) throw new Error('Mention dropdown never appeared. Click inside the message box and rerun.');
  items[0].click();
  await sleep(800);
  log('bootstrap mention created');

  /* ---- 5. Walk the React fiber tree to find the Lexical editor ---- */
  function deepFindEditor(el) {
    const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fk) return null;
    let node = el[fk];
    for (let d = 0; d < 300 && node; d++, node = node.return) {
      try {
        let s = node.memoizedState;
        for (let sd = 0; s && sd < 30; sd++, s = s.next) {
          const ms = s.memoizedState;
          if (ms && ms._parentEditor) return ms._parentEditor;
          if (s._parentEditor) return s._parentEditor;
        }
        const p = node.memoizedProps;
        if (p && p.editor && p.editor._editorState) return p.editor;
      } catch (e) {}
    }
    return null;
  }
  const ed = deepFindEditor(input);
  if (!ed) throw new Error('Lexical editor instance not found.');
  window.__waEditor = ed;

  /* ---- 6. Harvest the node constructors + a template mention ---- */
  let MNC = null, TC = null;
  const scan = () => ed.getEditorState().read(() => {
    ed.getEditorState()._nodeMap.forEach(n => {
      if (n.__type === 'mention' && !MNC) MNC = Object.getPrototypeOf(n).constructor;
      if (n.__type === 'text'    && !TC)  TC  = Object.getPrototypeOf(n).constructor;
    });
  });
  scan();
  if (!MNC) throw new Error('Bootstrap produced no mention node.');
  if (!TC) {                       // no text node yet — make one
    input.focus();
    document.execCommand('insertText', false, ' ');
    await sleep(300);
    scan();
  }
  if (!TC) throw new Error('Text node class not found.');

  /* ---- 7. Harden the renderer.
     Injected mentions can trip createDOM for members with odd/absent
     names, and a throw there blanks the whole compose box. These
     wrappers fall back to a hand-built span with the same shape. ---- */
  let MENTION_CLASS = 'selectable-text copyable-text';
  const sampleEl = input.querySelector('[data-app-text-template]');
  if (sampleEl) MENTION_CLASS = sampleEl.className;

  if (!MNC.prototype.__tagallPatched) {
    const origCD = MNC.prototype.createDOM;
    MNC.prototype.createDOM = function (cfg, e) {
      try { return origCD.call(this, cfg, e); }
      catch (err) {
        warn('createDOM fallback for', this.wid, err.message);
        const span = document.createElement('span');
        span.className = MENTION_CLASS;
        span.setAttribute('data-lexical-text', 'true');
        span.setAttribute('data-app-text-template', '​' + (this.wid || '') + '​');
        span.textContent = this.__text || '@';
        return span;
      }
    };
    const origUD = MNC.prototype.updateDOM;
    MNC.prototype.updateDOM = function (prev, dom, cfg) {
      try { return origUD.call(this, prev, dom, cfg); }
      catch (err) {
        dom.textContent = this.__text || '@';
        dom.setAttribute('data-app-text-template', '​' + (this.wid || '') + '​');
        return false;
      }
    };
    MNC.prototype.__tagallPatched = true;
    log('renderer patched');
  }

  /* ---- 8. Inject everyone else + the message, in one transaction ---- */
  const already = new Set();
  let lastMention = null;
  ed.getEditorState().read(() => {
    ed.getEditorState()._nodeMap.forEach(n => {
      if (n.__type === 'mention') { lastMention = n; if (n.wid) already.add(n.wid); }
    });
  });
  if (myId) already.add(myId);                    // don't tag yourself

  const todo = roster.filter(p => !already.has(p.lid));
  log(`already in box: ${already.size} | injecting: ${todo.length}`);

  ed.update(() => {
    let cursor = lastMention.getWritable();
    for (const p of todo) {
      const sp = new TC(' ');
      // The constructor takes ONE options object. Building the node this way
      // is what populates `parsableText` (the zero-width-space-delimited wid
      // that WhatsApp actually parses on send). Setting .name/.wid by hand
      // afterwards does NOT — that produces mentions that render green but
      // send as plain gray text.
      const mn = new MNC({ name: p.name, wid: p.lid, type: 'CONTACT' });
      mn.__text = '@' + p.name;   // visible label only
      cursor.insertAfter(sp);
      sp.insertAfter(mn);
      cursor = mn;
    }
    cursor.insertAfter(new TC(' ' + MESSAGE));
  }, { tag: 'history-merge' });

  await sleep(400);

  /* ---- 9. Verify ---- */
  /* A mention only sends as a real mention if getNodeMetadata() yields a
     parsableText delimited by zero-width spaces and containing the wid.
     Nodes that look green on screen but fail this check are the "gray text
     on send" bug, so we verify every single one before handing it over. */
  let count = 0, valid = 0, broken = 0;
  const wids = [];
  ed.getEditorState().read(() => {
    ed.getEditorState()._nodeMap.forEach(n => {
      if (n.__type !== 'mention') return;
      count++; wids.push(n.wid);
      try {
        const m = n.getNodeMetadata();
        const pt = m && m.parsableText;
        if (pt && pt.charCodeAt(0) === 0x200b &&
            pt.includes(String(m.wid).split('@')[0])) valid++;
        else broken++;
      } catch (e) { broken++; }
    });
  });
  const domLen = input.innerText.length;

  log(`RESULT — mentions: ${count} / roster ${roster.length} | verified: ${valid} | broken: ${broken} | length: ${domLen}`);

  if (!domLen) {
    warn('Compose box rendered empty — reload the page and rerun.');
  } else if (broken) {
    console.error(`[tagall] ${broken} mention(s) will send as plain gray text. ` +
                  `Do NOT send. WhatsApp likely changed its mention node API.`);
  } else {
    log('%c✓ All mentions verified. Review the box, then press send YOURSELF. Nothing was sent.',
        'color:#25d366;font-size:13px');
  }

  window.__tagall = { group: groupTitle, groupId: group.id._serialized, detectedVia: how,
                      roster, mentions: count, wids, editor: ed };
  return `done — "${groupTitle}": ${count} mentions + message, nothing sent`;
})().then(console.log).catch(e => console.error('[tagall] FAILED:', e));
