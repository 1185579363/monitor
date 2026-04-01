# STCN News Site

Cloudflare Pages 可部署的实时新闻页。

## 部署

1. 把当前目录推到 GitHub。
2. 在 Cloudflare Pages 中连接该仓库。
3. 构建设置：
   - Framework preset: `None`
   - Build command: 留空
   - Build output directory: `.`
4. 部署完成后，页面会通过 `functions/api/news.js` 提供实时接口 `/api/news`。

## 本地预览

推荐使用 Wrangler：

```bash
npx wrangler pages dev .
```

然后访问本地预览地址。
