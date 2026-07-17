// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// First-run welcome page (opened by the service worker on install):
// what CrosTem does, where the badges show up, link to settings.
import { applyI18n, currentLocale, initExtPageI18n } from '../lib/i18n';
import { ctLogo } from '../lib/logo';

document.querySelector('.logo')?.replaceWith(ctLogo(56));

document.getElementById('open-options')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void (async () => {
  await initExtPageI18n();
  document.documentElement.lang = currentLocale();
  applyI18n('onboardingTitle');
})();
