// Phone screenshots in the style of four apps, imitating layout and colours
// only. No logo, app name or trademark appears anywhere in the image.
//   line:   Japanese group chat, blue-grey wallpaper, green own bubbles
//   wechat: Chinese group chat, grey background, square avatars
//   x:      Japanese timeline of short posts
//   xhs:    Chinese note page with a text cover image and comments
// Elements with data-mask (names, avatars, phone numbers, room numbers,
// handles) are measured by render.mjs for the masking ground truth. Each
// scrolling region has data-clip so boxes are clipped to what is visible.

import { avatar, esc, homeIndicator, JA_FONT, maskSpan, page, richText, statusBar, ZH_FONT } from "./common.mjs";

const icon = {
  chevron: (c = "#111") => `<svg width="13" height="22" viewBox="0 0 13 22"><path d="M11 2 L2 11 L11 20" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: (c = "#111", s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 22 22"><circle cx="9.5" cy="9.5" r="7" stroke="${c}" stroke-width="2" fill="none"/><path d="M15 15 L20 20" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  phone: (c = "#111") => `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M5 2.5 L8.5 2.5 L10 7 L7.8 8.6 C8.9 11 11 13.1 13.4 14.2 L15 12 L19.5 13.5 L19.5 17 C19.5 18.4 18.4 19.5 17 19.5 C9.5 19 3 12.5 2.5 5 C2.5 3.6 3.6 2.5 5 2.5 Z" stroke="${c}" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>`,
  menu: (c = "#111") => `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 5 H19 M3 11 H19 M3 17 H19" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`,
  dots: (c = "#111") => `<svg width="24" height="6" viewBox="0 0 24 6"><circle cx="3" cy="3" r="2.4" fill="${c}"/><circle cx="12" cy="3" r="2.4" fill="${c}"/><circle cx="21" cy="3" r="2.4" fill="${c}"/></svg>`,
  plus: (c = "#111", s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 4 V20 M4 12 H20" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  camera: (c = "#111") => `<svg width="25" height="22" viewBox="0 0 25 22"><path d="M2 7 C2 5.9 2.9 5 4 5 H7.5 L9.5 2 H15.5 L17.5 5 H21 C22.1 5 23 5.9 23 7 V18 C23 19.1 22.1 20 21 20 H4 C2.9 20 2 19.1 2 18 Z" stroke="${c}" stroke-width="1.8" fill="none"/><circle cx="12.5" cy="12" r="4.2" stroke="${c}" stroke-width="1.8" fill="none"/></svg>`,
  image: (c = "#111") => `<svg width="24" height="22" viewBox="0 0 24 22"><rect x="2" y="2" width="20" height="18" rx="2.5" stroke="${c}" stroke-width="1.8" fill="none"/><path d="M4 17 L9.5 11 L13 14.5 L16 12 L20 16.5" stroke="${c}" stroke-width="1.8" fill="none" stroke-linejoin="round"/><circle cx="16" cy="7" r="1.8" fill="${c}"/></svg>`,
  smile: (c = "#111", s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" stroke="${c}" stroke-width="1.8" fill="none"/><circle cx="8.8" cy="10" r="1.3" fill="${c}"/><circle cx="15.2" cy="10" r="1.3" fill="${c}"/><path d="M8 14.2 C9.8 16.6 14.2 16.6 16 14.2" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
  mic: (c = "#111") => `<svg width="18" height="24" viewBox="0 0 18 24"><rect x="5" y="2" width="8" height="13" rx="4" stroke="${c}" stroke-width="1.8" fill="none"/><path d="M2 11 C2 15 5 18 9 18 C13 18 16 15 16 11 M9 18 V22" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
  voice: (c = "#181818") => `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12.5" stroke="${c}" stroke-width="1.6" fill="none"/><path d="M10.5 11 C12 12.5 12 15.5 10.5 17 M13.5 8.5 C16.5 11.5 16.5 16.5 13.5 19.5" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  circlePlus: (c = "#181818") => `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12.5" stroke="${c}" stroke-width="1.6" fill="none"/><path d="M14 8.5 V19.5 M8.5 14 H19.5" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  reply: (c) => `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 8 C3 4.7 5.7 2.5 9 2.5 C12.3 2.5 15 4.7 15 8 C15 11.3 12.3 13.5 9 13.5 H8 L4.5 16 V12.5 C3.6 11.5 3 9.8 3 8 Z" stroke="${c}" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>`,
  repost: (c) => `<svg width="20" height="18" viewBox="0 0 20 18"><path d="M4 14 V5 H13 M10 2 L13 5 L10 8 M16 4 V13 H7 M10 16 L7 13 L10 10" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  heart: (c, fill = "none", s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18"><path d="M9 15.5 C3.5 11.8 1.5 9 1.5 6.3 C1.5 4 3.3 2.3 5.4 2.3 C7 2.3 8.3 3.2 9 4.5 C9.7 3.2 11 2.3 12.6 2.3 C14.7 2.3 16.5 4 16.5 6.3 C16.5 9 14.5 11.8 9 15.5 Z" stroke="${c}" stroke-width="1.5" fill="${fill}" stroke-linejoin="round"/></svg>`,
  views: (c) => `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 16 V9 M7.5 16 V3 M12 16 V7 M16 16 V11" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  bookmark: (c) => `<svg width="16" height="18" viewBox="0 0 16 18"><path d="M3 2 H13 V16 L8 12.5 L3 16 Z" stroke="${c}" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>`,
  share: (c, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18"><path d="M9 11 V2.5 M5.5 6 L9 2.5 L12.5 6 M3 10 V15.5 H15 V10" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  home: (c) => `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 11 L13 3.5 L22 11 V22 H16 V15.5 H10 V22 H4 Z" stroke="${c}" stroke-width="2" fill="${c}" stroke-linejoin="round"/></svg>`,
  bell: (c) => `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M6 18 V11.5 C6 7.6 9.1 4.5 13 4.5 C16.9 4.5 20 7.6 20 11.5 V18 L22 20.5 H4 Z M10.5 22.5 C11 23.7 11.9 24.3 13 24.3 C14.1 24.3 15 23.7 15.5 22.5" stroke="${c}" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>`,
  mail: (c) => `<svg width="26" height="26" viewBox="0 0 26 26"><rect x="3" y="6" width="20" height="15" rx="2.5" stroke="${c}" stroke-width="1.8" fill="none"/><path d="M4 7.5 L13 14 L22 7.5" stroke="${c}" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>`,
  people: (c) => `<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="9.5" cy="9" r="3.6" stroke="${c}" stroke-width="1.8" fill="none"/><circle cx="17.5" cy="10" r="3" stroke="${c}" stroke-width="1.8" fill="none"/><path d="M3 21 C3 16.8 6 14.5 9.5 14.5 C13 14.5 16 16.8 16 21 M16.5 15 C19.6 15 22.5 16.9 22.5 20.5" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
  star: (c, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 3 L14.6 8.6 L20.7 9.3 L16.2 13.4 L17.4 19.5 L12 16.5 L6.6 19.5 L7.8 13.4 L3.3 9.3 L9.4 8.6 Z" stroke="${c}" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg>`,
  comment: (c, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M4 11.5 C4 7.4 7.6 4.5 12 4.5 C16.4 4.5 20 7.4 20 11.5 C20 15.6 16.4 18.5 12 18.5 C11 18.5 10.1 18.4 9.2 18.1 L5.2 20 L6.2 16.5 C4.8 15.2 4 13.4 4 11.5 Z" stroke="${c}" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg>`,
  pencil: (c) => `<svg width="15" height="15" viewBox="0 0 15 15"><path d="M2 13 L2.6 10 L10.5 2.1 L12.9 4.5 L5 12.4 Z" stroke="${c}" stroke-width="1.4" fill="none" stroke-linejoin="round"/></svg>`,
};

function personAvatar(spec, name, size, radius) {
  const p = spec.people?.[name] ?? {};
  return avatar({ owner: name, size, radius, glyph: p.glyph ?? "initial", seed: p.seed ?? name });
}

// ---------------------------------------------------------------- line style

function lineHtml(spec) {
  const rows = [];
  let prev = null;
  for (const m of spec.messages) {
    if (m.date) {
      rows.push(`<div class="date"><span>${esc(m.date)}</span></div>`);
      prev = null;
      continue;
    }
    if (m.self) {
      const read = m.read ? `既読 ${m.read}<br>` : "";
      rows.push(`<div class="row self${prev === "self" ? "" : " first"}"><div class="meta">${read}${esc(m.time)}</div><div class="bubble">${richText(m.text)}</div></div>`);
      prev = "self";
      continue;
    }
    const first = prev !== m.from;
    rows.push(`<div class="row other${first ? " first" : ""}">
      <div class="av">${first ? personAvatar(spec, m.from, 38) : ""}</div>
      <div class="col">${first ? `<div class="name">${maskSpan("name", m.from)}</div>` : ""}
        <div class="line"><div class="bubble">${richText(m.text)}</div><div class="meta">${esc(m.time)}</div></div>
      </div></div>`);
    prev = m.from;
  }
  const body = `<div class="screen">
    ${statusBar({ time: spec.statusTime, colour: "#111" })}
    <div class="header">
      <span class="back">${icon.chevron("#111")}</span>
      <span class="title">${esc(spec.title)} (${spec.members})</span>
      <span class="tools">${icon.search("#111")}${icon.phone("#111")}${icon.menu("#111")}</span>
    </div>
    <div class="chat" data-clip><div class="stack">${rows.join("")}</div></div>
    <div class="input">
      <span>${icon.plus("#3A3F47")}</span><span>${icon.camera("#3A3F47")}</span><span>${icon.image("#3A3F47")}</span>
      <span class="field">Aa<span class="smile">${icon.smile("#9AA0A8", 20)}</span></span><span>${icon.mic("#3A3F47")}</span>
    </div>
    <div style="background:#fff">${homeIndicator("#111")}</div>
  </div>`;
  const css = `
    .screen{width:390px;height:844px;display:flex;flex-direction:column;background:#8CABD9}
    .header{height:46px;display:flex;align-items:center;padding:0 14px;gap:12px;color:#111}
    .header .title{flex:1;font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .header .tools{display:flex;gap:18px;align-items:center}
    .chat{flex:1;overflow:hidden;position:relative}
    .stack{position:absolute;left:0;right:0;bottom:0;padding:6px 0 12px}
    .date{text-align:center;margin:10px 0 12px}
    .date span{display:inline-block;background:rgba(40,60,90,0.22);color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:12px}
    .row{display:flex;padding:0 10px 0 10px;margin-top:6px}
    .row.first{margin-top:12px}
    .other .av{width:38px;margin-right:8px;flex:none}
    .other .col{display:flex;flex-direction:column;min-width:0}
    .other .name{font-size:11.5px;color:rgba(20,30,50,0.72);margin:0 0 4px 2px;font-weight:500}
    .line{display:flex;align-items:flex-end;gap:5px}
    .bubble{position:relative;max-width:238px;font-size:15.5px;line-height:1.45;padding:8px 12px;border-radius:17px;word-break:break-word;color:#111}
    .other .bubble{background:#fff}
    .other.first .bubble{border-top-left-radius:4px}
    .self{justify-content:flex-end;align-items:flex-end;gap:5px}
    .self .bubble{background:#8DE055}
    .self.first .bubble{border-top-right-radius:4px}
    .meta{font-size:10.5px;color:rgba(20,30,50,0.6);line-height:1.3;white-space:nowrap;text-align:right;padding-bottom:1px}
    .other .meta{text-align:left}
    .input{background:#fff;height:50px;display:flex;align-items:center;gap:15px;padding:0 14px;border-top:0.5px solid #E2E4E8}
    .input .field{flex:1;height:34px;border-radius:17px;background:#F1F2F4;color:#9AA0A8;font-size:15px;display:flex;align-items:center;padding:0 10px 0 14px;justify-content:space-between}
    .input .smile{display:flex}
  `;
  return page({ lang: "ja", font: JA_FONT, body, css });
}

// -------------------------------------------------------------- wechat style

function wechatHtml(spec) {
  const rows = spec.messages.map((m) => {
    if (m.time && !m.text) return `<div class="time">${esc(m.time)}</div>`;
    if (m.self) {
      return `<div class="row self"><div class="bubble">${richText(m.text)}</div>${personAvatar(spec, spec.selfName, 40, 10)}</div>`;
    }
    return `<div class="row other">${personAvatar(spec, m.from, 40, 10)}
      <div class="col"><div class="name">${maskSpan("name", m.from)}</div><div class="bubble">${richText(m.text)}</div></div></div>`;
  });
  const body = `<div class="screen">
    ${statusBar({ time: spec.statusTime, colour: "#111" })}
    <div class="header"><span class="back">${icon.chevron("#111")}</span><span class="title">${esc(spec.title)}(${spec.members})</span><span class="more">${icon.dots("#111")}</span></div>
    <div class="chat" data-clip><div class="stack">${rows.join("")}</div></div>
    <div class="input"><span>${icon.voice()}</span><span class="field"></span><span>${icon.smile("#181818", 28)}</span><span>${icon.circlePlus()}</span></div>
    <div style="background:#F7F7F7">${homeIndicator("#111")}</div>
  </div>`;
  const css = `
    .screen{width:390px;height:844px;display:flex;flex-direction:column;background:#EDEDED}
    .header{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:0.5px solid #D6D6D6;position:relative}
    .header .title{position:absolute;left:60px;right:60px;text-align:center;font-size:17px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .chat{flex:1;overflow:hidden;position:relative}
    .stack{position:absolute;left:0;right:0;bottom:0;padding:4px 0 14px}
    .time{text-align:center;color:#A3A3A3;font-size:12.5px;margin:16px 0 4px}
    .row{display:flex;padding:0 12px;margin-top:14px;align-items:flex-start}
    .other .col{margin-left:10px;display:flex;flex-direction:column;align-items:flex-start}
    .name{font-size:12px;color:#8A8A8A;margin:0 0 4px 2px}
    .bubble{position:relative;max-width:246px;font-size:16.5px;line-height:1.45;padding:9px 12px;border-radius:5px;color:#191919;word-break:break-word}
    .other .bubble{background:#fff}
    .other .bubble::before{content:"";position:absolute;left:-6px;top:13px;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:6px solid #fff}
    .self{justify-content:flex-end}
    .self .bubble{background:#95EC69;margin-right:10px}
    .self .bubble::after{content:"";position:absolute;right:-6px;top:13px;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:6px solid #95EC69}
    .input{background:#F7F7F7;height:56px;display:flex;align-items:center;gap:10px;padding:0 10px;border-top:0.5px solid #DCDCDC}
    .input .field{flex:1;height:38px;border-radius:5px;background:#fff}
    .input span{display:flex}
  `;
  return page({ lang: "zh-CN", font: ZH_FONT, body, css });
}

// ------------------------------------------------------------------- x style

function xHtml(spec) {
  const grey = "#536471";
  const posts = spec.posts.map((p) => `<div class="post">
      ${personAvatar(spec, p.name, 40)}
      <div class="content">
        <div class="head">${maskSpan("name", p.name)}<span class="handle">${maskSpan("handle", p.handle)} · ${esc(p.ago)}</span><span class="more">${icon.dots(grey).replace('width="24"', 'width="16"')}</span></div>
        <div class="text">${richText(p.text)}</div>
        <div class="actions">
          <span>${icon.reply(grey)}${esc(p.counts[0])}</span><span>${icon.repost(grey)}${esc(p.counts[1])}</span>
          <span>${icon.heart(grey)}${esc(p.counts[2])}</span><span>${icon.views(grey)}${esc(p.counts[3])}</span>
          <span class="end">${icon.bookmark(grey)}${icon.share(grey)}</span>
        </div>
      </div></div>`);
  const body = `<div class="screen">
    ${statusBar({ time: spec.statusTime, colour: "#0F1419" })}
    <div class="top"><div class="bar">${personAvatar(spec, spec.selfName, 32)}</div>
      <div class="tabs"><span class="on">${esc(spec.tabs[0])}</span><span>${esc(spec.tabs[1])}</span></div></div>
    <div class="feed" data-clip>${posts.join("")}</div>
    <div class="fab">${icon.plus("#fff", 26)}</div>
    <div class="nav">${icon.home("#0F1419")}${icon.search("#0F1419", 24)}${icon.people("#0F1419")}${icon.bell("#0F1419")}${icon.mail("#0F1419")}</div>
    ${homeIndicator("#0F1419")}
  </div>`;
  const css = `
    .screen{width:390px;height:844px;display:flex;flex-direction:column;background:#fff;position:relative;color:#0F1419}
    .top{border-bottom:0.5px solid #EFF3F4}
    .top .bar{height:46px;display:flex;align-items:center;padding:0 16px}
    .tabs{display:flex;height:44px}
    .tabs span{flex:1;display:flex;align-items:center;justify-content:center;font-size:15px;color:#536471;font-weight:500;position:relative}
    .tabs span.on{color:#0F1419;font-weight:700}
    .tabs span.on::after{content:"";position:absolute;bottom:0;left:50%;width:64px;margin-left:-32px;height:4px;border-radius:2px;background:#1D9BF0}
    .feed{flex:1;overflow:hidden}
    .post{display:flex;gap:10px;padding:12px 16px 10px;border-bottom:0.5px solid #EFF3F4}
    .content{flex:1;min-width:0}
    .head{display:flex;align-items:center;gap:4px;font-size:15px;white-space:nowrap}
    .head > .pii{font-weight:700}
    .handle{color:#536471;overflow:hidden;text-overflow:ellipsis}
    .head .more{margin-left:auto;display:flex}
    .text{font-size:15px;line-height:1.5;margin-top:2px;word-break:break-word}
    .actions{display:flex;align-items:center;gap:18px;margin-top:10px;color:#536471;font-size:13px;white-space:nowrap}
    .actions span{display:flex;align-items:center;gap:3px;min-width:44px}
    .actions .end{margin-left:auto;gap:14px}
    .fab{position:absolute;right:18px;bottom:102px;width:56px;height:56px;border-radius:28px;background:#1D9BF0;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.18)}
    .nav{height:50px;border-top:0.5px solid #EFF3F4;display:flex;align-items:center;justify-content:space-around;padding:0 8px}
  `;
  return page({ lang: "ja", font: JA_FONT, body, css });
}

// ----------------------------------------------------------------- xhs style

function xhsHtml(spec) {
  const n = spec.note;
  const tags = n.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ");
  const comments = n.comments.map((c) => `<div class="comment">
      ${personAvatar(spec, c.name, 32)}
      <div class="ccol"><div class="cname">${maskSpan("name", c.name)}</div><div class="ctext">${richText(c.text)}</div>
        <div class="cmeta">${esc(c.meta)} <b>回复</b></div></div>
      <div class="clike">${icon.heart("#999", "none", 16)}<span>${esc(c.likes)}</span></div></div>`);
  const cover = n.cover.map((l, i) => `<div class="cl${i === 1 ? " hl" : ""}">${esc(l)}</div>`).join("");
  const body = `<div class="screen">
    ${statusBar({ time: spec.statusTime, colour: "#111" })}
    <div class="top">${icon.chevron("#222")}${personAvatar(spec, n.author, 34)}<span class="author">${maskSpan("name", n.author)}</span>
      <span class="follow">关注</span>${icon.share("#222", 22)}</div>
    <div class="scroll" data-clip>
      <div class="cover"><div class="count">1/3</div><div class="sticker">⚠️</div>${cover}<div class="sub">${esc(n.coverSub)}</div></div>
      <div class="dots"><i class="on"></i><i></i><i></i></div>
      <div class="ntitle">${esc(n.title)}</div>
      <div class="nbody">${richText(n.body)}<br>${tags}</div>
      <div class="nmeta">${esc(n.meta)}</div>
      <div class="sep"></div>
      <div class="ccount">${esc(n.commentCount)}</div>
      ${comments.join("")}
    </div>
    <div class="bottom"><span class="say">${icon.pencil("#999")}说点什么...</span>
      <span class="stat">${icon.heart("#333", "none", 24)}${esc(n.stats[0])}</span><span class="stat">${icon.star("#333")}${esc(n.stats[1])}</span><span class="stat">${icon.comment("#333")}${esc(n.stats[2])}</span></div>
    ${homeIndicator("#111")}
  </div>`;
  const css = `
    .screen{width:390px;height:844px;display:flex;flex-direction:column;background:#fff;color:#222}
    .top{height:48px;display:flex;align-items:center;gap:10px;padding:0 14px}
    .top .author{flex:1;font-size:15px;color:#333;white-space:nowrap}
    .follow{border:1px solid #FF2442;color:#FF2442;font-size:14px;font-weight:600;border-radius:16px;padding:4px 16px;margin-right:6px}
    .scroll{flex:1;overflow:hidden}
    .cover{height:268px;background:#FFF3CF;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
    .cover .count{position:absolute;right:12px;top:12px;background:rgba(0,0,0,0.35);color:#fff;font-size:12px;padding:3px 9px;border-radius:10px}
    .cover .sticker{position:absolute;left:24px;top:30px;font-size:34px;transform:rotate(-12deg)}
    .cl{font-size:34px;font-weight:800;color:#2E2A24;letter-spacing:1px}
    .cl.hl{background:linear-gradient(transparent 58%, #FFC53D 58%);padding:0 6px}
    .cover .sub{margin-top:14px;font-size:16px;color:#6B5E45;font-weight:600}
    .dots{display:flex;justify-content:center;gap:5px;padding:10px 0 2px}
    .dots i{width:6px;height:6px;border-radius:3px;background:#D9D9D9}
    .dots i.on{background:#FF2442}
    .ntitle{font-size:17.5px;font-weight:600;padding:8px 16px 6px;line-height:1.45}
    .nbody{font-size:15.5px;line-height:1.65;color:#333;padding:0 16px;word-break:break-word}
    .tag{color:#13386C}
    .nmeta{font-size:12.5px;color:#999;padding:10px 16px 12px}
    .sep{height:0.5px;background:#EEE;margin:0 16px}
    .ccount{font-size:13.5px;color:#666;padding:12px 16px 10px}
    .comment{display:flex;gap:10px;padding:0 16px 14px;align-items:flex-start}
    .ccol{flex:1;min-width:0}
    .cname{font-size:13px;color:#999}
    .ctext{font-size:14.5px;color:#333;line-height:1.5;margin-top:2px}
    .cmeta{font-size:12px;color:#B0B0B0;margin-top:4px}
    .cmeta b{font-weight:500;color:#888;margin-left:6px}
    .clike{display:flex;flex-direction:column;align-items:center;color:#999;font-size:11px;gap:2px;padding-top:6px}
    .bottom{height:52px;border-top:0.5px solid #F0F0F0;display:flex;align-items:center;gap:14px;padding:0 14px}
    .say{flex:1;height:36px;border-radius:18px;background:#F5F5F5;color:#999;font-size:14px;display:flex;align-items:center;gap:6px;padding:0 14px}
    .stat{display:flex;align-items:center;gap:3px;font-size:14px;color:#333}
  `;
  return page({ lang: "zh-CN", font: ZH_FONT, body, css });
}

export function chatHtml(spec) {
  switch (spec.style) {
    case "line":
      return lineHtml(spec);
    case "wechat":
      return wechatHtml(spec);
    case "x":
      return xHtml(spec);
    case "xhs":
      return xhsHtml(spec);
    default:
      throw new Error(`unknown chat style ${spec.style}`);
  }
}
