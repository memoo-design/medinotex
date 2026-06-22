// ── Page Loader ──────────────────────────────────────────────────────────────
window.addEventListener('load', function () {
  var loader = document.getElementById('page-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(function () { loader.remove(); }, 500);
  }
});

// ── Patient Registration Form Handler ────────────────────────────────────────
function handlePatientRegister(e) {
  if (e && e.preventDefault) e.preventDefault();
  var emailEl = document.getElementById('regEmail');
  var email = emailEl ? emailEl.value.trim() : '';
  
  var modalEl = document.getElementById('patientRegisterModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    var modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  setTimeout(function () {
    alert('Registration submitted! Please check your email (' + email + ') to verify your account.');
  }, 300);
  return false;
}

// ── Demo Modal Helper Functions ──────────────────────────────────────────────
function resetDemoModal() {
  var formState    = document.getElementById('demoFormState');
  var successState = document.getElementById('demoSuccessState');
  if (formState)    formState.classList.remove('d-none');
  if (successState) successState.classList.add('d-none');

  var btn     = document.getElementById('demoSubmitBtn');
  var label   = document.getElementById('demoSubmitLabel');
  var spinner = document.getElementById('demoSubmitSpinner');
  if (btn)     btn.disabled = false;
  if (label)   label.textContent = 'Submit Request';
  if (spinner) spinner.classList.add('d-none');

  ['demoFullName', 'demoOrg', 'demoEmail', 'demoPhone', 'demoUsers', 'demoMessage'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var roleEl = document.getElementById('demoRole');
  if (roleEl) roleEl.value = '';

  document.querySelectorAll('#demoFormState input, #demoFormState select, #demoFormState textarea').forEach(function (el) {
    el.classList.remove('is-invalid', 'is-valid');
  });
}

function handleDemoSubmission(e) {
  if (e && e.preventDefault) e.preventDefault();
  var valid = true;

  function check(fieldId, errorId, testFn) {
    var field = document.getElementById(fieldId);
    var error = document.getElementById(errorId);
    if (!field) return;
    if (!testFn(field.value)) {
      field.classList.add('is-invalid');
      field.classList.remove('is-valid');
      if (error) error.style.display = 'block';
      valid = false;
    } else {
      field.classList.remove('is-invalid');
      field.classList.add('is-valid');
      if (error) error.style.display = 'none';
    }
  }

  check('demoFullName', 'errFullName', function (v) { return v.trim().length >= 2; });
  check('demoOrg',      'errOrg',      function (v) { return v.trim().length >= 2; });
  check('demoRole',     'errRole',     function (v) { return v !== ''; });
  check('demoEmail',    'errEmail',    function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); });
  check('demoPhone',    'errPhone',    function (v) { return v.trim().length >= 7; });
  check('demoUsers',    'errUsers',    function (v) { return Number.isInteger(Number(v)) && Number(v) > 0; });

  if (!valid) return;

  var fullNameEl = document.getElementById('demoFullName');
  var emailEl = document.getElementById('demoEmail');
  var name = fullNameEl ? fullNameEl.value.trim() : '';
  var email = emailEl ? emailEl.value.trim() : '';

  var btn     = document.getElementById('demoSubmitBtn');
  var label   = document.getElementById('demoSubmitLabel');
  var spinner = document.getElementById('demoSubmitSpinner');
  if (btn)     btn.disabled = true;
  if (label)   label.textContent = 'Submitting…';
  if (spinner) spinner.classList.remove('d-none');

  setTimeout(function () {
    showDemoSuccess(name, email);
  }, 1200);
  return false;
}

function showDemoSuccess(name, email) {
  var formState    = document.getElementById('demoFormState');
  var successState = document.getElementById('demoSuccessState');
  var successMsg   = document.getElementById('demoSuccessMsg');

  if (successMsg) {
    successMsg.innerHTML = 'Thank you, <strong>' + escapeHTML(name) + '</strong>. Our team will reach out to <strong>' + escapeHTML(email) + '</strong> within 1 business day.';
  }
  if (formState)    formState.classList.add('d-none');
  if (successState) successState.classList.remove('d-none');
}

function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ── Main UI Initialization ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {

  /* ---------- Sticky Navbar Shadow ---------- */
  var nav = document.getElementById('mainNav');
  window.addEventListener('scroll', function () {
    if (nav) {
      if (window.scrollY > 40) {
        nav.classList.add('shadow-sm', 'scrolled');
      } else {
        nav.classList.remove('shadow-sm', 'scrolled');
      }
    }
  }, { passive: true });

  /* ---------- Bootstrap Dropdown Fallback ---------- */
  var dropdownElements = [].slice.call(document.querySelectorAll('[data-bs-toggle="dropdown"]'));
  if (typeof bootstrap !== 'undefined') {
    dropdownElements.forEach(function (el) { new bootstrap.Dropdown(el); });
  }

  /* ---------- Demo Modal Reset Event Listener ---------- */
  var demoModal = document.getElementById('requestDemoModal');
  if (demoModal) {
    demoModal.addEventListener('hidden.bs.modal', resetDemoModal);
  }

  /* ---------- Navbar Active Link on Scroll ---------- */
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  var activateLink = function () {
    var scrollY = window.scrollY + 120;
    sections.forEach(function (sec) {
      if (scrollY >= sec.offsetTop && scrollY < sec.offsetTop + sec.offsetHeight) {
        navLinks.forEach(function (a) { a.classList.remove('active'); });
        var active = document.querySelector('.nav-link[href="#' + sec.id + '"]');
        if (active) active.classList.add('active');
      }
    });
  };
  window.addEventListener('scroll', activateLink, { passive: true });
  activateLink(); // Run on initial boot

  /* ---------- Smooth Scrolling For Hash Targets ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var hrefAttr = anchor.getAttribute('href');
      if (hrefAttr === '#') return;
      var target = document.querySelector(hrefAttr);
      if (!target) return;
      e.preventDefault();
      var offset = 80;
      var top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
      
      var bsCollapse = document.querySelector('.navbar-collapse.show');
      if (bsCollapse) {
        var toggler = document.querySelector('.navbar-toggler');
        if (toggler) toggler.click();
      }
    });
  });

  /* ---------- Back to Top Button ---------- */
  var btt = document.getElementById('backToTop');
  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) btt?.classList.add('visible');
    else btt?.classList.remove('visible');
  }, { passive: true });
  btt?.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- IntersectionObserver Scroll Reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ---------- Counter Metrics Animation ---------- */
  var counters = document.querySelectorAll('.stat-number[data-target]');
  var easeOutQuad = function (t) { return t * (2 - t); };

  var animateCounter = function (el) {
    var target   = parseFloat(el.dataset.target);
    var suffix   = el.dataset.suffix || '';
    var prefix   = el.dataset.prefix || '';
    var decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
    var duration = 2200;
    var startTime  = null;

    var step = function (timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed  = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var value    = easeOutQuad(progress) * target;
      el.textContent = prefix + value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if ('IntersectionObserver' in window) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (c) { counterObserver.observe(c); });
  } else {
    counters.forEach(function (c) { animateCounter(c); });
  }

  /* ---------- Testimonial Multi-Feature Carousel Engine ---------- */
  (function () {
    var track       = document.getElementById('testiTrack');
    var prevBtn     = document.getElementById('testiPrev');
    var nextBtn     = document.getElementById('testiNext');
    var dotsWrap    = document.getElementById('testiDots');
    var progressBar = document.getElementById('testiProgress');
    if (!track) return;

    var slides      = Array.from(track.querySelectorAll('.testi-slide'));
    var AUTOPLAY_MS = 4500;

    var current       = 0;
    var autoTimer     = null;
    var rafProgress   = null;
    var progressStart = null;
    var hovering      = false;

    var visibleCount = function () {
      return window.innerWidth <= 640 ? 1 : (window.innerWidth <= 991 ? 2 : 3);
    };

    var maxIndex = function () { return Math.max(0, slides.length - visibleCount()); };
    var clamp = function (val) { return Math.max(0, Math.min(val, maxIndex())); };

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      var n = maxIndex() + 1;
      for (var i = 0; i < n; i++) {
        (function (index) {
          var d = document.createElement('button');
          d.className = 'testi-dot' + (index === current ? ' active' : '');
          d.setAttribute('aria-label', 'Slide ' + (index + 1));
          d.addEventListener('click', function () { goTo(index, true); });
          dotsWrap.appendChild(d);
        })(i);
      }
    }

    function updateDots() {
      if (!dotsWrap) return;
      dotsWrap.querySelectorAll('.testi-dot').forEach(function (d, i) {
        d.classList.toggle('active', i === current);
      });
    }

    function updateActiveClass() {
      slides.forEach(function (s, i) { s.classList.toggle('is-active', i === current); });
    }

    function getOffset() {
      if (!slides.length) return 0;
      var gap    = 24;
      var slideW = slides[0].getBoundingClientRect().width;
      return current * (slideW + gap);
    }

    function applyTransform(instant) {
      if (instant) track.style.transition = 'none';
      else track.style.transition = 'transform 0.55s cubic-bezier(0.4,0,0.2,1)';
      track.style.transform = 'translateX(-' + getOffset() + 'px)';
    }

    function goTo(index, resetTimer) {
      current = clamp(index);
      applyTransform();
      updateDots();
      updateActiveClass();
      if (resetTimer !== false) resetAutoplay();
    }

    function startProgress() {
      if (!progressBar) return;
      cancelAnimationFrame(rafProgress);
      progressStart = performance.now();
      progressBar.style.width = '0%';

      function tick(now) {
        var pct = Math.min(((now - progressStart) / AUTOPLAY_MS) * 100, 100);
        progressBar.style.width = pct + '%';
        if (pct < 100) rafProgress = requestAnimationFrame(tick);
      }
      rafProgress = requestAnimationFrame(tick);
    }

    function stopProgress() {
      cancelAnimationFrame(rafProgress);
    }

    function startAutoplay() {
      clearInterval(autoTimer);
      startProgress();
      autoTimer = setInterval(function () {
        if (hovering) return;
        var next = current >= maxIndex() ? 0 : current + 1;
        goTo(next, false);
        startProgress();
      }, AUTOPLAY_MS);
    }

    function resetAutoplay() { startAutoplay(); }
    function pauseAutoplay() {
      clearInterval(autoTimer);
      stopProgress();
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { goTo(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goTo(current + 1); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });

    track.addEventListener('mouseenter', function () { hovering = true;  pauseAutoplay(); });
    track.addEventListener('mouseleave', function () { hovering = false; startAutoplay(); });

    var dragStartX = 0, dragDeltaX = 0, isDragging = false;

    track.addEventListener('pointerdown', function (e) {
      dragStartX = e.clientX;
      dragDeltaX = 0;
      isDragging = true;
      track.classList.add('dragging');
      track.setPointerCapture(e.pointerId);
      pauseAutoplay();
    });

    track.addEventListener('pointermove', function (e) {
      if (!isDragging) return;
      dragDeltaX = e.clientX - dragStartX;
      track.style.transition = 'none';
      track.style.transform  = 'translateX(-' + (getOffset() - dragDeltaX) + 'px)';
    });

    var endDrag = function () {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove('dragging');
      if (Math.abs(dragDeltaX) > 60) {
        goTo(dragDeltaX < 0 ? current + 1 : current - 1);
      } else {
        applyTransform();
      }
      if (!hovering) resetAutoplay();
    };

    track.addEventListener('pointerup',     endDrag);
    track.addEventListener('pointercancel', endDrag);

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        current = clamp(current);
        buildDots();
        applyTransform(true);
        requestAnimationFrame(function () { track.style.transition = ''; });
        updateActiveClass();
      }, 200);
    });

    buildDots();
    updateActiveClass();
    applyTransform(true);
    startAutoplay();
  })();

  /* ---------- Navbar Brand Context Highlight Monitoring ---------- */
  var heroSection = document.getElementById('hero');
  var navBrand    = document.querySelector('.navbar-brand');
  if (heroSection && 'IntersectionObserver' in window) {
    var heroObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && navBrand) {
          navBrand.style.setProperty('color', 'var(--primary)');
        }
      });
    }, { threshold: 0.1 });
    heroObserver.observe(heroSection);
  }
});