// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// First-run welcome page (opened by the service worker on install):
// what CrosTem does, where the badges show up, link to settings.
import { applyI18n } from '../lib/i18n';
import { ctLogo } from '../lib/logo';

document.documentElement.lang = chrome.i18n.getUILanguage();
applyI18n('onboardingTitle');
document.querySelector('.logo')?.replaceWith(ctLogo(56));

document.getElementById('open-options')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});
