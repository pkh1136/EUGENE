// 유진투자증권 리서치센터 '기업분석' 게시판의 최신 목록을 board.json으로 저장합니다.
// index.html이 GitHub Pages 같은 공개 호스팅에서 열릴 때 이 파일을 읽습니다.
// GitHub Actions(.github/workflows/update-board.yml)가 30분마다 실행합니다. Node 20 이상 필요.
//
//   node scripts/update-board.mjs

import { readFile, writeFile } from "node:fs/promises";

const LIST_URL = "https://www.eugenefn.com/comm/msgList.do?menu_id=02010401&menu_url=/ingo/igii/igii400&menu_lever=4&board_yn=Y";
const OUT = new URL("../board.json", import.meta.url);

const decode = s => s
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const text = s => decode(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

// one <tr> per report: 번호, 구분, 제목(상세 링크), 다운로드, 작성일, 작성자, 자료원
function parseBoard(html) {
  const rows = [];
  for (const tr of html.match(/<tr[\s>][\s\S]*?<\/tr>/g) || []) {
    if (!/class="sbj"/.test(tr)) continue;
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    const msgId = (tr.match(/searchDetailPop\('(\d+)'\)/) || [])[1];
    const dl = tr.match(/downLoad\('(\d+)',\s*'(\d+)'\)/);
    const title = text((tds[2] || "").replace(/<span[^>]*ico_pdf[^>]*>[\s\S]*?<\/span>/g, ""));
    if (!msgId || !title) continue;
    rows.push({
      sector: text(tds[1] || ""),
      title,
      msgId,
      attachId: dl ? dl[2] : null,
      date: text(tds[4] || ""),
      author: text(tds[5] || ""),
    });
  }
  return rows;
}

const res = await fetch(LIST_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; EugeneVipDesk/1.0)", "Referer": "https://www.eugenefn.com/" },
  signal: AbortSignal.timeout(30000),
});
if (!res.ok) throw new Error(`게시판 요청 실패: HTTP ${res.status}`);
const rows = parseBoard(await res.text());
// an empty result means the page layout changed or the request was blocked: fail loudly, keep the old file
if (!rows.length) throw new Error("목록을 읽지 못했습니다. 게시판 구조가 바뀌었거나 요청이 차단됐을 수 있습니다.");

let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }
if (prev && JSON.stringify(prev.rows) === JSON.stringify(rows)) {
  console.log("변경 없음");
  process.exit(0);
}
await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), source: LIST_URL, rows }, null, 2) + "\n");
console.log(`board.json 갱신: ${rows.length}건`);
