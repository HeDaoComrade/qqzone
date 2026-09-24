const fs = require('fs');
const path = require('path');

hexo.extend.generator.register('qzone_sync', function (locals) {
  const cfg = hexo.config.qzone_sync || {};
  if (!cfg.enabled) return;

  const jsonPath = path.join(hexo.base_dir, cfg.json_path || 'qzone_shuoshuo_backup.json');
  if (!fs.existsSync(jsonPath)) {
    hexo.log.warn('[qzone-sync] JSON 文件不存在: ' + jsonPath);
    return;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    hexo.log.error('[qzone-sync] JSON 解析失败: ' + e.message);
    return;
  }

  const list = Array.isArray(raw) ? raw : (raw.data || raw.list || raw.msglist || []);
  if (!Array.isArray(list)) {
    hexo.log.warn('[qzone-sync] 无法识别的数据格式');
    return;
  }

  const posts = list.map(item => {
    // --- 时间 ---
    let date = null;
    if (item.created_time) {
      const n = Number(item.created_time);
      date = new Date(n < 1e12 ? n * 1000 : n);
    } else if (item.createTime) {
      date = new Date(item.createTime);
    }
    const dateStr = date && !isNaN(date)
      ? date.toLocaleString('zh-CN', { hour12: false })
      : (item.createTime || '');
    const timestamp = date && !isNaN(date) ? date.getTime() : 0;

    // --- 正文 ---
    let content = item.content || item.text || item.message || '';
    content = content.replace(/\[em\](.*?)\[\/em\]/g, '😊');

    // --- 图片：pic 数组，URL 在 pic_id / smallurl / url 里 ---
    let images = item.pic || item.images || item.pics || [];
    if (!Array.isArray(images)) images = [images];
    const imgHtml = images.map(img => {
      let url = '';
      if (typeof img === 'string') {
        url = img;
      } else if (img && typeof img === 'object') {
        // 优先原图 pic_id，退而求其次 smallurl / url
        url = img.pic_id || img.url || img.smallurl || img.absolut || '';
      }
      if (!url) return '';
      if (url.startsWith('//')) url = 'https:' + url;
      if (!url.startsWith('http')) return '';
      return `<img src="${url}" style="max-width:100%;border-radius:8px;margin:4px 0;" loading="lazy" referrerpolicy="no-referrer">`;
    }).join('');

    // --- 评论：过滤掉 type=2（正文）和没有 name 的项 ---
    const rawComments = item.conlist || item.commentlist || item.comments || [];
    const comments = Array.isArray(rawComments)
      ? rawComments.filter(c => c && c.name && c.type !== 2)
      : [];
    const commentHtml = comments.length
      ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;font-size:0.9em;color:#666;">` +
        comments.map(c => {
          const name = c.name || '匿名';
          const text = c.con || c.content || c.text || '';
          return `<div><strong>${escapeHtml(name)}</strong>：${escapeHtml(text)}</div>`;
        }).join('') + `</div>`
      : '';

    // --- 定位 ---
    const lbsName = item.lbs && item.lbs.name ? item.lbs.name : '';
    const lbsHtml = lbsName
      ? `<div style="font-size:0.85em;color:#999;margin-top:6px;">📍 ${escapeHtml(lbsName)}</div>`
      : '';

    // --- 互动数据 ---
    const stats = [];
    if (item.cmtnum) stats.push(`评论 ${item.cmtnum}`);
    if (item.fwdnum) stats.push(`转发 ${item.fwdnum}`);
    const statsHtml = stats.length
      ? `<div style="font-size:0.85em;color:#999;margin-top:6px;">${stats.join(' · ')}</div>`
      : '';

    return { dateStr, timestamp, content, imgHtml, lbsHtml, commentHtml, statsHtml };
  }).sort((a, b) => b.timestamp - a.timestamp);

  const title = cfg.title || '说说';
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f7f7f7; color: #333; }
  h1 { text-align: center; font-weight: 500; }
  .qzone-item { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .qzone-date { color: #999; font-size: 0.85em; margin-bottom: 8px; }
  .qzone-content { line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
  .qzone-item img { max-width: 100%; border-radius: 8px; margin: 4px 0; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p style="text-align:center;color:#999;font-size:0.9em;">共 ${posts.length} 条</p>
${posts.map(p => `
<div class="qzone-item">
  <div class="qzone-date">${escapeHtml(p.dateStr)}</div>
  <div class="qzone-content">${escapeHtml(p.content)}</div>
  ${p.imgHtml}
  ${p.lbsHtml}
  ${p.commentHtml}
  ${p.statsHtml}
</div>`).join('')}
</body>
</html>`;

  return {
    path: (cfg.path || 'qzone/').replace(/\/?$/, '/') + 'index.html',
    data: html
  };
});

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}