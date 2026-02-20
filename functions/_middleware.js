const FIREBASE_DB = 'https://poetry-blog-ff72f-default-rtdb.europe-west1.firebasedatabase.app';
const SITE_URL = 'https://konvi.space';
const SITE_NAME = 'Поетична платформа KonVi';

// Боти яким потрібен prerendered HTML
const BOT_AGENTS = ['googlebot', 'bingbot', 'yandex', 'duckduckbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot', 'whatsapp', 'telegrambot', 'slackbot'];

function isBot(userAgent = '') {
    const ua = userAgent.toLowerCase();
    return BOT_AGENTS.some(bot => ua.includes(bot));
}

async function fetchFirebase(path) {
    const res = await fetch(`${FIREBASE_DB}/${path}.json`);
    if (!res.ok) return null;
    return res.json();
}

function escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildHtml({ title, description, url, image, bodyHtml }) {
    const fullTitle = title ? `${title} — KonVi` : SITE_NAME;
    const fullUrl = `${SITE_URL}${url}`;
    const img = image || `${SITE_URL}/logo.webp`;

    return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(fullUrl)}">
<meta property="og:image" content="${escapeHtml(img)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(fullUrl)}">
<script>
    // Redirect real users to SPA
    if (!/bot|crawler|spider|googlebot|bingbot|yandex/i.test(navigator.userAgent)) {
        window.location.href = '${escapeHtml(fullUrl)}';
    }
</script>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function handlePost(postId) {
    // Шукаємо пост у Firebase
    const posts = await fetchFirebase('posts');
    if (!posts || !posts[postId]) return null;

    const post = posts[postId];
    const authorData = post.userId ? await fetchFirebase(`users/${post.userId}`) : null;
    const authorName = authorData?.name || 'Невідомий автор';

    const description = (post.content || '').substring(0, 160).replace(/\n/g, ' ');
    const dateStr = post.date ? new Date(post.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    const bodyHtml = `
<article>
    <h1>${escapeHtml(post.title || 'Без назви')}</h1>
    <p><strong>Автор:</strong> ${escapeHtml(authorName)}</p>
    ${dateStr ? `<p><time>${escapeHtml(dateStr)}</time></p>` : ''}
    <div>${escapeHtml(post.content || '').replace(/\n/g, '<br>')}</div>
    ${post.hashtags ? `<p>${escapeHtml(typeof post.hashtags === 'string' ? post.hashtags : post.hashtags.join(' '))}</p>` : ''}
</article>`;

    return buildHtml({
        title: post.title || 'Публікація',
        description,
        url: `/post/${postId}`,
        image: authorData?.avatarUrl,
        bodyHtml
    });
}

async function handleProfile(userId) {
    const userData = await fetchFirebase(`users/${userId}`);
    if (!userData) return null;

    const description = userData.bio
        ? userData.bio.substring(0, 160)
        : `Профіль автора ${userData.name || ''} на платформі KonVi`;

    // Отримуємо пости автора
    const allPosts = await fetchFirebase('posts');
    const userPosts = allPosts
        ? Object.entries(allPosts)
            .filter(([, p]) => p.userId === userId && p.title && p.content)
            .sort(([, a], [, b]) => new Date(b.date) - new Date(a.date))
            .slice(0, 10)
        : [];

    const postsHtml = userPosts.map(([id, p]) =>
        `<li><a href="${SITE_URL}/post/${id}">${escapeHtml(p.title || 'Без назви')}</a></li>`
    ).join('');

    const bodyHtml = `
<article>
    <h1>${escapeHtml(userData.name || 'Автор')}</h1>
    ${userData.bio ? `<p>${escapeHtml(userData.bio)}</p>` : ''}
    <p>📝 Публікацій: ${userData.postsCount || 0}</p>
    ${postsHtml ? `<ul>${postsHtml}</ul>` : ''}
</article>`;

    return buildHtml({
        title: userData.name || 'Профіль автора',
        description,
        url: `/profile/${userId}`,
        image: userData.avatarUrl,
        bodyHtml
    });
}

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';
    const path = url.pathname;

    // Тільки для ботів і тільки для /post/ та /profile/
    if (isBot(ua)) {
        const postMatch = path.match(/^\/post\/([^/]+)$/);
        const profileMatch = path.match(/^\/profile\/([^/]+)$/);

        try {
            if (postMatch) {
                const html = await handlePost(postMatch[1]);
                if (html) return new Response(html, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }

            if (profileMatch) {
                const html = await handleProfile(profileMatch[1]);
                if (html) return new Response(html, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }
        } catch (e) {
            // Якщо щось пішло не так — віддаємо звичайний index.html
            console.error('Middleware error:', e);
        }
    }

    // Для всіх інших — звичайний SPA
    return next();
}
