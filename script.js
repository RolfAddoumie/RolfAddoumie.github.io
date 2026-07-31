// --- theme toggle ---
const root = document.documentElement;
const btn = document.getElementById('theme');

const saved = localStorage.getItem('theme');
if (saved) root.setAttribute('data-theme', saved);

btn.addEventListener('click', () => {
  const current = root.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// --- blog: click a post to expand it ---
document.querySelectorAll('.post-head').forEach((head) => {
  head.addEventListener('click', () => {
    const post = head.closest('.post');
    const open = post.classList.toggle('open');
    head.setAttribute('aria-expanded', String(open));
  });
});

// --- reveal sections as they scroll into view ---
// the hidden state is added here rather than in the html, so a visitor without
// js (or with reduced motion) just sees the page normally.
const wantsMotion = !matchMedia('(prefers-reduced-motion: reduce)').matches;

if (wantsMotion && 'IntersectionObserver' in window) {
  const targets = document.querySelectorAll('main > section, main > footer');
  targets.forEach((el) => el.classList.add('reveal'));

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
    // start the reveal before the section reaches the viewport, so tall
    // sections (the game) aren't still fading in once they're on screen
  }, { rootMargin: '0px 0px 18% 0px', threshold: 0 });

  targets.forEach((el) => io.observe(el));
}

// --- blog: arriving at blog.html#some-post opens that post ---
const hashPost = location.hash && document.querySelector(location.hash);
if (hashPost && hashPost.classList.contains('post')) {
  hashPost.classList.add('open');
  hashPost.querySelector('.post-head')?.setAttribute('aria-expanded', 'true');
  hashPost.scrollIntoView({ block: 'center' });
}

// --- gallery: click a photo to view it full-size, then flip through them ---
const lightbox = document.getElementById('lightbox');

if (lightbox) {
  const lbImg = lightbox.querySelector('img');
  const lbCaption = lightbox.querySelector('.lightbox-caption');
  const lbCount = lightbox.querySelector('.lightbox-count');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  const photos = [...document.querySelectorAll('.gallery img, .post-photo img')];
  let index = 0;
  let lastFocused = null;

  const show = (i) => {
    // wrap around at both ends
    index = (i + photos.length) % photos.length;
    const img = photos[index];
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    const cap = img.closest('figure')?.querySelector('figcaption');
    lbCaption.textContent = cap ? cap.textContent : '';
    if (lbCount) lbCount.textContent = `${index + 1} / ${photos.length}`;
    // a single photo doesn't need arrows
    const many = photos.length > 1;
    if (prevBtn) prevBtn.hidden = !many;
    if (nextBtn) nextBtn.hidden = !many;
    if (lbCount) lbCount.hidden = !many;
  };

  const openLightbox = (i) => {
    lastFocused = photos[i];
    show(i);
    lightbox.hidden = false;
    // the page behind shouldn't scroll while the photo is up
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('.lightbox-close').focus();
  };

  const closeLightbox = () => {
    lightbox.hidden = true;
    lbImg.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  };

  photos.forEach((img, i) => {
    // keyboard users get the same affordance the mouse gets
    img.tabIndex = 0;
    img.setAttribute('role', 'button');

    img.addEventListener('click', () => openLightbox(i));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(i);
      }
    });
  });

  prevBtn?.addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
  nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });

  // clicking the backdrop (but not the photo or the controls) closes it
  lightbox.addEventListener('click', (e) => {
    if (e.target === lbImg || e.target.closest('button')) return;
    closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  // swipe on touch screens
  let touchX = null;
  lightbox.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) show(index + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });
}
