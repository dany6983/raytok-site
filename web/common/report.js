// web/common/report.js — RayTok 청취 페이지 및 웹 강사 화면 공통 기록 저장 모듈
// 외부 의존성 0건. 내용 3종(both, src, trans) × 형식 3종(TXT, DOC, PDF)
// L4-3: 줄에 label(출처 표시, 예 "(원고 3)")이 있으면 내용 앞에 붙이고, footer(글 줄 배열)가 있으면 본문 뒤에 적는다
//       (원고 모드 리포트 — 건너뛴 문단). 둘 다 없으면 출력은 전과 글자 하나 다르지 않다.
// 브라우저에서는 window.RayTokReport 하나만 내놓는다 — pad2·escapeHtml 같은 이름이 불러 쓰는 페이지의
// 같은 이름 함수와 부딪히지 않게 함수로 감쌌다(안쪽 들여쓰기는 차이를 줄이려고 그대로 둔다).
(function () {

function labelOf(l) {
  return (l && typeof l.label === 'string' && l.label) ? l.label + ' ' : '';
}

function footerLines(footer) {
  if (!footer) return [];
  return (Array.isArray(footer) ? footer : [footer]).filter(f => typeof f === 'string' && f);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * TXT 보고서 문자열 생성
 */
function buildReportText({ lines = [], srcLang = 'ko', targetLang = 'en', langName = 'English', contentMode = 'both', footer = null }) {
  const first = lines.length ? new Date(lines[0].at) : new Date();
  const out = [];
  out.push('RayTok');
  out.push(`${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(first.getDate())} ${pad2(first.getHours())}:${pad2(first.getMinutes())}`);
  out.push(`${(srcLang || 'ko').toUpperCase()} → ${langName || targetLang} (${targetLang})`);
  out.push(`Lines: ${lines.length}`);
  out.push('');

  for (const l of lines) {
    const d = new Date(l.at);
    const timeStr = `[${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}]`;
    const tr = (l.tr && l.tr[targetLang]) ? l.tr[targetLang] : '';
    const label = labelOf(l);

    if (contentMode === 'src') {
      out.push(`${timeStr} ${label}${l.text}`);
    } else if (contentMode === 'trans' || contentMode === 'tr') {
      out.push(`${timeStr} ${label}${tr || l.text}`);
    } else {
      // both (기본)
      out.push(`${timeStr} ${label}${l.text}`);
      if (tr) out.push(tr);
    }
    out.push('');
  }

  for (const f of footerLines(footer)) {
    out.push(f);
    out.push('');
  }

  return out.join('\r\n');
}

/**
 * HTML/DOC/PDF 인쇄용 HTML 문서 문자열 생성
 */
function buildReportHtml({ lines = [], srcLang = 'ko', targetLang = 'en', langName = 'English', contentMode = 'both', isRtl = false, footer = null }) {
  const first = lines.length ? new Date(lines[0].at) : new Date();
  const dateStr = `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(first.getDate())} ${pad2(first.getHours())}:${pad2(first.getMinutes())}`;
  const langPairStr = `${(srcLang || 'ko').toUpperCase()} → ${langName || targetLang} (${targetLang})`;

  const rows = lines.map((l, idx) => {
    const d = new Date(l.at);
    const timeStr = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    const tr = (l.tr && l.tr[targetLang]) ? l.tr[targetLang] : '';
    const label = escapeHtml(labelOf(l));

    let contentHtml = '';
    if (contentMode === 'src') {
      contentHtml = `<div class="line-src">${label}${escapeHtml(l.text)}</div>`;
    } else if (contentMode === 'trans' || contentMode === 'tr') {
      contentHtml = `<div class="line-tr" ${isRtl ? 'dir="rtl"' : ''}>${label}${escapeHtml(tr || l.text)}</div>`;
    } else {
      contentHtml = `<div class="line-src">${label}${escapeHtml(l.text)}</div>`;
      if (tr) {
        contentHtml += `<div class="line-tr" ${isRtl ? 'dir="rtl"' : ''}>${escapeHtml(tr)}</div>`;
      }
    }

    return `
    <tr class="line-row">
      <td class="col-seq">${idx + 1}</td>
      <td class="col-time">${timeStr}</td>
      <td class="col-content">${contentHtml}</td>
    </tr>`;
  }).join('');

  const footerHtml = footerLines(footer).map(f => `\n  <p class="report-footer" style="margin-top:14px;font-size:13px;color:#475569;">${escapeHtml(f)}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="${targetLang}" ${isRtl ? 'dir="rtl"' : 'dir="ltr"'}>
<head>
  <meta charset="utf-8">
  <title>RayTok Transcript</title>
  <style>
    @page { size: auto; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Helvetica, Arial, sans-serif;
      margin: 0; padding: 24px; color: #1e293b; background: #fff; line-height: 1.5;
    }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
    .title { font-size: 22px; font-weight: bold; color: #0284c7; margin-bottom: 6px; }
    .meta { font-size: 13px; color: #64748b; }
    .meta span { margin-right: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 8px 10px; text-align: left; font-weight: 600; color: #475569; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .col-seq { width: 40px; color: #94a3b8; font-size: 12px; text-align: center; }
    .col-time { width: 75px; color: #64748b; font-size: 12px; }
    .col-content { }
    .line-src { color: #0f172a; margin-bottom: 4px; }
    .line-tr { color: #0369a1; font-weight: 500; }
    @media print {
      body { padding: 0; }
      .line-row { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">RayTok</div>
    <div class="meta">
      <span><strong>일시:</strong> ${dateStr}</span>
      <span><strong>언어:</strong> ${escapeHtml(langPairStr)}</span>
      <span><strong>라인 수:</strong> ${lines.length}줄</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:40px; text-align:center;">#</th>
        <th style="width:75px;">시각</th>
        <th>내용</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>${footerHtml}
</body>
</html>`;
}

/**
 * 파일 이름 생성: raytok_yyyymmdd_hhmm_<내용>_<lang>.ext
 * 단, 기본 'both' 모드일 때는 기존 정규식 호환을 위해 <내용> 생략
 */
function generateReportFilename({ date, contentMode = 'both', langCode = 'en', ext = 'txt' }) {
  const d = date || new Date();
  const ymd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const hm = `${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  
  if (contentMode === 'src') {
    return `raytok_${ymd}_${hm}_src_${langCode}.${ext}`;
  } else if (contentMode === 'trans' || contentMode === 'tr') {
    return `raytok_${ymd}_${hm}_trans_${langCode}.${ext}`;
  } else {
    // both
    return `raytok_${ymd}_${hm}_${langCode}.${ext}`;
  }
}

/**
 * 브라우저 다운로드 트리거
 */
function downloadReport({ lines = [], srcLang = 'ko', targetLang = 'en', langName = 'English', contentMode = 'both', format = 'txt', isRtl = false, footer = null }) {
  if (!lines || !lines.length) return false;
  const first = lines.length ? new Date(lines[0].at) : new Date();

  if (format === 'pdf') {
    // PDF: 인쇄용 iframe 생성 후 window.print()
    const html = buildReportHtml({ lines, srcLang, targetLang, langName, contentMode, isRtl, footer });
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('PDF print error:', err);
      } finally {
        setTimeout(() => iframe.remove(), 2000);
      }
    }, 250);
    return true;
  }

  if (format === 'doc') {
    // DOC: application/msword
    const html = buildReportHtml({ lines, srcLang, targetLang, langName, contentMode, isRtl, footer });
    const blob = new Blob(['\uFEFF' + html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = generateReportFilename({ date: first, contentMode, langCode: targetLang, ext: 'doc' });
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  // TXT (기본)
  const text = buildReportText({ lines, srcLang, targetLang, langName, contentMode, footer });
  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const filename = generateReportFilename({ date: first, contentMode, langCode: targetLang, ext: 'txt' });
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pad2,
    escapeHtml,
    buildReportText,
    buildReportHtml,
    generateReportFilename,
    downloadReport
  };
} else {
  window.RayTokReport = {
    pad2,
    escapeHtml,
    buildReportText,
    buildReportHtml,
    generateReportFilename,
    downloadReport
  };
}

})();
