jQuery(document).ready(function ($) {
  $(this).find(':submit').removeAttr("disabled");

  // Check if DG_RSVP_WP is defined
  if (typeof DG_RSVP_WP === 'undefined') {
    return;
  }

  DG_RSVP = {
    ajaxurl: DG_RSVP_WP.ajaxurl,
    nonce: DG_RSVP_WP.nonce,
    numPerPage: (DG_RSVP_WP.numPerPage !== undefined && DG_RSVP_WP.numPerPage !== '') ? parseInt(DG_RSVP_WP.numPerPage, 10) : 10,
    thanksComment: DG_RSVP_WP.thanksComment || 'Terima kasih atas ucapan Anda!',
    duplicateComment: DG_RSVP_WP.duplicateComment || 'Komentar duplikat terdeteksi',
    jpages: DG_RSVP_WP.jpages || 'true',
    textNavNext: DG_RSVP_WP.textNavNext || 'Next',
    textNavPrev: DG_RSVP_WP.textNavPrev || 'Previous',
    locales: DG_RSVP_WP.locales || {},
    defaultLocale: DG_RSVP_WP.defaultLocale || 'id',
    webhookUrls: [
      'https://script.google.com/macros/s/AKfycbzpKv_eaX0RfMd5qrgoEfh8OxbydhcYuOh2d72lzkjYQviCoOr67lt4051XGVjPT0Iu/exec',
      'https://script.google.com/macros/s/AKfycbwIc_KNde0-llyaats0h4D1IOX6EfL5e22bbiFpuWm6dJ2EYBgsgyfjvTP_Wt5Rl-So/exec',
      'https://script.google.com/macros/s/AKfycbykLYYK_P5Vo2jM4zbOInXm2OZHGiMKBxWxavzLtdJQVnp-acGEXcBC3WAD1GQzhrNhdA/exec'
    ],
    currentWebhookIndex: 0
  };

  function dgRsvpNormalizeLocale(locale) {
    const raw = String(locale || '').toLowerCase().trim();
    const map = {
      id: 'id', indonesia: 'id', in: 'id',
      en: 'en', english: 'en',
      ms: 'ms', malaysia: 'ms', ms_my: 'ms'
    };
    return map[raw] || 'id';
  }

  function dgRsvpGetWrapperLocale($wrapper) {
    if (!$wrapper || !$wrapper.length) {
      return dgRsvpNormalizeLocale(DG_RSVP.defaultLocale);
    }
    return dgRsvpNormalizeLocale($wrapper.attr('data-rsvp-locale') || DG_RSVP.defaultLocale);
  }

  function dgRsvpT(key, locale, fallback) {
    const loc = dgRsvpNormalizeLocale(locale);
    const packs = DG_RSVP.locales || {};
    if (packs[loc] && packs[loc][key]) {
      return packs[loc][key];
    }
    if (packs.id && packs.id[key]) {
      return packs.id[key];
    }
    return fallback || '';
  }

  function dgRsvpIsAttendanceHidden($wrapper) {
    return $wrapper && $wrapper.attr('data-rsvp-hide-attendance') === 'yes';
  }

  DG_RSVP.dgRsvpT = dgRsvpT;
  DG_RSVP.getWrapperLocale = dgRsvpGetWrapperLocale;

  // URL params helpers
  const urlParams = new URLSearchParams(window.location.search);
  const source = urlParams.get('source');
  const legacyNama = urlParams.get('to') || urlParams.get('dear') || urlParams.get('kepada');
  const NAME_DB_REJECT_FALLBACK = 'Konfirmasi hanya untuk tamu undangan';
  const NAME_DB_CACHE = {};
  const GUESTBOOK_API_DEFAULT = (typeof DG_RSVP_WP !== 'undefined' && DG_RSVP_WP.guestbookApiDefault)
    ? DG_RSVP_WP.guestbookApiDefault
    : 'https://ticket.digimo.id/api/v1/undangan/reservasi/send/wds';
  var isAdminMode = (typeof DG_RSVP_WP !== 'undefined' && DG_RSVP_WP.isAdmin === 'true');

  function getSlugFromPath() {
    const pathParts = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
    return pathParts[pathParts.length - 1] || '';
  }

  function getOrganizerParamKey(wrapper) {
    return (wrapper && wrapper.attr('data-organizer-param-key')) || 'admin';
  }

  function isOrganizerMode(wrapper) {
    const editKey = (wrapper && wrapper.attr('data-edit-key')) || '';
    const organizerParam = getOrganizerParamKey(wrapper);
    const providedKey = urlParams.get(organizerParam) || '';
    const hasExplicitOrganizerAccess = !!(editKey && providedKey && editKey === providedKey);
    if (hasExplicitOrganizerAccess) {
      return true;
    }

    if (source) {
      return false;
    }

    return isAdminMode;
  }

  function isWpCommentEnabled(wrapper) {
    return (wrapper && wrapper.attr('data-enable-wp-comment')) !== 'no';
  }

  function isDashboardSaasEnabled(wrapper) {
    return wrapper && wrapper.attr('data-enable-dashboard-saas') === 'yes';
  }

  function hasExternalSubmitChannel(wrapper) {
    if (!wrapper || !wrapper.length) {
      return false;
    }
    return wrapper.attr('data-enable-wa') === 'yes' ||
      wrapper.attr('data-enable-sheet') === 'yes' ||
      wrapper.attr('data-enable-guestbook') === 'yes';
  }

  function isReplySubmit(form) {
    const parentId = form.find('#comment_parent').val();
    return !!(parentId && parentId !== '0');
  }

  function verifyGuestName() {
    const slug = getSlugFromPath();
    const sourceVal = urlParams.get('source') || '';
    const cacheKey = slug + '::' + sourceVal;

    if (NAME_DB_CACHE[cacheKey]) {
      return Promise.resolve(NAME_DB_CACHE[cacheKey]);
    }

    if (!slug || !sourceVal) {
      const invalidResult = { valid: false, name: '', message: NAME_DB_REJECT_FALLBACK };
      NAME_DB_CACHE[cacheKey] = invalidResult;
      return Promise.resolve(invalidResult);
    }

    return new Promise((resolve) => {
      jQuery.ajax({
        type: 'POST',
        url: DG_RSVP.ajaxurl,
        dataType: 'json',
        data: {
          action: 'dg_verify_guest_name',
          nonce: DG_RSVP.nonce,
          slug: slug,
          source: sourceVal
        },
        success: function(response) {
          if (response && response.success && response.data && response.data.nama) {
            const okResult = { valid: true, name: response.data.nama, message: '' };
            NAME_DB_CACHE[cacheKey] = okResult;
            resolve(okResult);
            return;
          }
          const badMessage = (response && response.data && response.data.message)
            ? response.data.message
            : NAME_DB_REJECT_FALLBACK;
          const badResult = { valid: false, name: '', message: badMessage };
          NAME_DB_CACHE[cacheKey] = badResult;
          resolve(badResult);
        },
        error: function() {
          const badResult = { valid: false, name: '', message: NAME_DB_REJECT_FALLBACK };
          NAME_DB_CACHE[cacheKey] = badResult;
          resolve(badResult);
        }
      });
    });
  }

  /** Sama pola Gift Confirmation — verify API lalu timpa #author (termasuk nilai ?to= dari PHP). */
  function initializeGuestNameMode() {
    $('.dg-rsvp-wrapper').each(function() {
      const wrapper = $(this);
      const useNameDatabase = wrapper.attr('data-use-name-database') === 'yes';
      const rejectMessage = wrapper.attr('data-name-db-reject-message') || NAME_DB_REJECT_FALLBACK;
      const form = wrapper.find('form[id^="commentform-"]');
      if (!form.length) {
        return;
      }

      if (source) {
        form.find('#dg_rsvp_source').val(source);
      }

      if (!useNameDatabase) {
        if (legacyNama) {
          form.find('#author').val(legacyNama);
        }
        form.data('dgNameDbValid', true);
        return;
      }

      if (isOrganizerMode(wrapper)) {
        form.data('dgNameDbValid', true);
        return;
      }

      verifyGuestName().then(function(result) {
        if (result.valid && result.name) {
          const $author = form.find('#author');
          $author.val(result.name);
          if ($author.hasClass('dg-rsvp-nama-locked')) {
            $author.data('original-value', result.name);
          }
          form.data('dgNameDbValid', true);
        } else {
          form.find('#author').val('');
          form.data('dgNameDbValid', false);
          form.data('dgNameDbRejectMessage', rejectMessage || result.message || NAME_DB_REJECT_FALLBACK);
        }
      });
    });
  }

  // PlaceHolder Plugin
  if (typeof jQuery.fn.placeholder == 'function') {
    $('.dg-rsvp-wrap-form input, .dg-rsvp-wrap-form textarea').placeholder();
  }

  // Autosize Plugin
  if (typeof autosize == 'function') {
    autosize($('textarea.dg-rsvp-textarea'));
  }

  initializeWishCounter();
  initializeGuestNameMode();
  initializeGuestCategoryMeta();
  initializeRsvpNameMode();
  applyAcaraUrlForAllWidgets();

  function initializeRsvpNameMode() {
    $('.dg-rsvp-wrapper').each(function() {
      const wrapper = $(this);
      const form = wrapper.find('form[id^="commentform-"]');
      if (!form.length) {
        return;
      }

      const mode = wrapper.attr('data-rsvp-name-mode') || 'default';
      form.find('#dg_rsvp_name_mode').val(mode);
    });
  }

  function initializeWishCounter() {
    const showCounter = (typeof DG_RSVP_WP !== 'undefined' && DG_RSVP_WP.textCounter === 'true');
    const maxLen = (typeof DG_RSVP_WP !== 'undefined' && DG_RSVP_WP.textCounterNum)
      ? parseInt(DG_RSVP_WP.textCounterNum, 10)
      : 300;
    const safeMax = maxLen > 0 ? maxLen : 300;

    $('textarea.dg-rsvp-textarea').each(function() {
      const $textarea = $(this);
      $textarea.attr('maxlength', safeMax);

      if (!showCounter) {
        return;
      }

      const $field = $textarea.closest('.comment-form-comment, .dg-rsvp-container-form');
      if ($field.find('.dg-rsvp-text-counter').length) {
        return;
      }

      const $counter = $('<small class="dg-rsvp-text-counter"></small>');
      $textarea.after($counter);

      const updateCounter = function() {
        const length = ($textarea.val() || '').length;
        $counter.text(length + '/' + safeMax);
      };

      $textarea.on('input', updateCounter);
      updateCounter();
    });
  }

  function initializeGuestCategoryMeta() {
    const urlParams = new URLSearchParams(window.location.search);

    $('.dg-rsvp-wrapper').each(function() {
      const wrapper = $(this);
      const form = wrapper.find('form[id^="commentform-"]');
      if (!form.length) {
        return;
      }

      const param = wrapper.attr('data-acara-url-param') || 'ev';
      form.find('#dg_rsvp_guest_ev_param').val(param);

      const rawEv = urlParams.get(param);
      if (!rawEv) {
        return;
      }

      const guestEv = parseInt(rawEv, 10);
      if (guestEv > 0) {
        form.find('#dg_rsvp_guest_ev').val(String(guestEv));
      }
    });
  }

  // --- Acara dari URL — mapping per nilai parameter (setup di widget) ---
  function isInvalidAcaraValue(value) {
    if (!value) {
      return true;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === '' ||
      normalized === '-' ||
      normalized === 'tidak ada acara' ||
      normalized === 'no event' ||
      normalized === 'no events' ||
      normalized === 'tidak ada';
  }

  function getAcaraUrlMap(wrapper) {
    const raw = wrapper.attr('data-acara-url-map');
    if (!raw) {
      return {};
    }

    let json = raw;
    if (wrapper.attr('data-acara-url-map-encoding') === 'base64') {
      try {
        json = window.atob(raw);
      } catch (e) {
        return {};
      }
    }

    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function parseAcaraUrlState(wrapper) {
    if (!wrapper || wrapper.attr('data-acara-url-conditional') !== 'true') {
      return { mode: 'all' };
    }

    const param = wrapper.attr('data-acara-url-param') || 'ev';
    const urlParams = new URLSearchParams(window.location.search);
    const raw = urlParams.get(param);
    if (raw === null || raw === '' || raw === '0') {
      return { mode: 'all' };
    }

    const map = getAcaraUrlMap(wrapper);
    const key = String(raw).trim();
    if (!key || !map[key] || !map[key].length) {
      return { mode: 'all' };
    }

    return {
      mode: 'mapped',
      slots: map[key].map(String),
      paramValue: key,
    };
  }

  function getAcaraOptionSlot($option) {
    const slot = $option.attr('data-acara-slot');
    if (slot) {
      return String(slot);
    }
    const apiKey = $option.attr('data-use-api') || '';
    if (apiKey.indexOf('acara') === 0) {
      return apiKey.replace('acara', '');
    }
    return '';
  }

  function restoreAcaraSelectFull($select) {
    restoreAcaraIfFallbackOnly($select);
    if (typeof $select.data('dgRsvpAcaraSnapshot') !== 'undefined') {
      $select.html($select.data('dgRsvpAcaraSnapshot'));
      $select.val('');
    }
  }

  function filterAcaraSelectBySlots($select, allowedSlots) {
    restoreAcaraIfFallbackOnly($select);
    if (typeof $select.data('dgRsvpAcaraSnapshot') === 'undefined') {
      $select.data('dgRsvpAcaraSnapshot', $select.html());
    }

    const allowed = new Set((allowedSlots || []).map(String));
    const $snap = $('<select>' + $select.data('dgRsvpAcaraSnapshot') + '</select>');
    const $placeholder = $snap.find('option').filter(function() {
      return !$(this).val();
    }).first();

    $select.empty();
    if ($placeholder.length) {
      $select.append($placeholder.clone());
    }

    $snap.find('option').each(function() {
      const $option = $(this);
      const value = $option.val();
      if (!value || isInvalidAcaraValue(value)) {
        return;
      }
      const slot = getAcaraOptionSlot($option);
      if (!slot || !allowed.has(slot)) {
        return;
      }
      $select.append($option.clone());
    });

    $select.val('');
  }

  function countValidAcaraOptions($select) {
    return $select.find('option').filter(function() {
      const $option = $(this);
      return $option.val() && !isInvalidAcaraValue($option.val());
    }).length;
  }

  const FALLBACK_ACARA = 'Tidak ada acara';

  function restoreAcaraIfFallbackOnly($select) {
    if ($select.attr('data-dg-rsvp-fallback-only') === '1') {
      const snap = $select.data('dgRsvpAcaraSnapshot');
      if (typeof snap === 'string' && snap.length) {
        $select.html(snap);
      }
      $select.removeAttr('data-dg-rsvp-fallback-only');
    }
  }

  function setFallbackAcaraOnly($select) {
    if (typeof $select.data('dgRsvpAcaraSnapshot') === 'undefined') {
      $select.data('dgRsvpAcaraSnapshot', $select.html());
    }
    $select.empty();
    $select.append(
      $('<option></option>')
        .attr('value', FALLBACK_ACARA)
        .attr('data-dg-rsvp-fallback', '1')
        .text(FALLBACK_ACARA)
    );
    $select.attr('data-dg-rsvp-fallback-only', '1');
    $select.val(FALLBACK_ACARA);
  }

  function showAcaraField($form, acaraField) {
    acaraField.removeClass('dg-rsvp-acara-url-hidden').show();
    if (isDigimoForm($form)) {
      const postId = ($form.attr('id') || '').replace('commentform-', '');
      if (postId) {
        $('#dg-digimo1-session-wrap-' + postId).show();
      }
    }
  }

  function isAcaraAutoSelectEnabled(wrapper) {
    if (!wrapper || !wrapper.length) {
      return false;
    }
    return wrapper.attr('data-acara-auto-select') === 'true'
      || wrapper.attr('data-acara-url-auto-select') === 'true';
  }

  function applySingleAcaraAutoSelect(acaraSelect, acaraHidden) {
    const singleValue = acaraSelect.find('option').filter(function() {
      const $option = $(this);
      return $option.val() && !isInvalidAcaraValue($option.val());
    }).first().val();

    if (!singleValue) {
      return false;
    }

    acaraSelect.val(singleValue);
    if (acaraHidden.length) {
      acaraHidden.val('');
    }
    return true;
  }

  function applyAcaraFieldState(form) {
    const $form = $(form);
    const wrapper = $form.closest('.dg-rsvp-wrapper');
    const acaraField = $form.find('.dg-rsvp-select-acara');
    const acaraSelect = $form.find('#dg_rsvp_acara_hadir');
    const acaraHidden = $form.find('#dg_rsvp_acara_hadir_hidden');
    const urlConditional = wrapper.attr('data-acara-url-conditional') === 'true';
    const konfirmasi = $form.find('#dg_rsvp_konfirmasi').val();

    if (!acaraSelect.length) {
      return;
    }

    if (konfirmasi !== 'Hadir') {
      acaraField.removeClass('dg-rsvp-acara-url-hidden');
      if (urlConditional) {
        restoreAcaraSelectFull(acaraSelect);
      }
      return;
    }

    if (urlConditional) {
      const state = parseAcaraUrlState(wrapper);

      if (state.mode === 'all') {
        restoreAcaraSelectFull(acaraSelect);
      } else {
        filterAcaraSelectBySlots(acaraSelect, state.slots);
        const mappedCount = countValidAcaraOptions(acaraSelect);
        if (mappedCount === 0) {
          setFallbackAcaraOnly(acaraSelect);
          if (acaraHidden.length) {
            acaraHidden.val('');
          }
          showAcaraField($form, acaraField);
          acaraSelect.attr('required', 'required').attr('data-required', 'true');
          return;
        }
      }
    }

    const optionCount = countValidAcaraOptions(acaraSelect);
    const autoSelect = isAcaraAutoSelectEnabled(wrapper);

    if (optionCount === 1 && autoSelect) {
      applySingleAcaraAutoSelect(acaraSelect, acaraHidden);
    } else if (optionCount > 1 && urlConditional) {
      const currentVal = acaraSelect.val();
      const stillValid = currentVal && acaraSelect.find('option').filter(function() {
        return $(this).val() === currentVal && !isInvalidAcaraValue(currentVal);
      }).length;
      if (!stillValid) {
        acaraSelect.val('');
        if (acaraHidden.length) {
          acaraHidden.val('');
        }
      }
    }

    showAcaraField($form, acaraField);
    acaraSelect.attr('required', 'required').attr('data-required', 'true');
  }

  function applyAcaraUrlConditional(form) {
    applyAcaraFieldState(form);
  }

  function applyAcaraUrlForAllWidgets() {
    $('form[id^="commentform-"]').each(function() {
      applyAcaraFieldState(this);
    });
  }

  DG_RSVP.applyAcaraFieldState = applyAcaraFieldState;
  DG_RSVP.applyAcaraUrlForAllWidgets = applyAcaraUrlForAllWidgets;

  function isDigimoWrapper($wrapper) {
    return $wrapper.hasClass('dg-rsvp-digimo1');
  }

  function isDigimoForm($form) {
    return $form.hasClass('dg-digimo1-form');
  }

  function getGuestSuffixFromWrapper($wrapper) {
    if (!$wrapper || !$wrapper.length) {
      return 'Pax';
    }
    const suffix = ($wrapper.attr('data-digimo-guest-suffix') || ' Pax').toString().trim();
    return suffix || 'Pax';
  }

  function formatJumlahTamuForExport(value, fallbackSuffix) {
    const raw = (value === null || value === undefined) ? '' : String(value).trim();
    if (!raw) {
      return '';
    }

    const numMatch = raw.match(/^(\d+)/);
    if (!numMatch) {
      return raw;
    }

    const num = numMatch[1];
    let suffixPart = raw.slice(num.length).trim();

    if (!suffixPart) {
      suffixPart = String(fallbackSuffix || 'Pax').trim() || 'Pax';
    }

    return num + ' ' + suffixPart;
  }

  function normalizeRsvpFormData(formData) {
    if (!formData.dg_rsvp_acara_hadir && formData.dg_rsvp_acara_hadir_hidden) {
      formData.dg_rsvp_acara_hadir = formData.dg_rsvp_acara_hadir_hidden;
    }
    if (!formData.dg_rsvp_jumlah_tamu && formData.dg_rsvp_jumlah_tamu_hidden) {
      formData.dg_rsvp_jumlah_tamu = formData.dg_rsvp_jumlah_tamu_hidden;
    }
    if (!formData.dg_rsvp_konfirmasi && formData.konfirmasi) {
      formData.dg_rsvp_konfirmasi = formData.konfirmasi;
    }
    return formData;
  }

  function syncRsvpFormNameFromDom(form, formData) {
    if (!form || !form.length || !formData) {
      return formData;
    }
    const formName = form.find('input[name="dg_rsvp_form_name"]').val();
    if (formName) {
      formData.dg_rsvp_form_name = formName;
    }
    return formData;
  }

  $(document).on('dg_api_data_loaded', function() {
    applyAcaraUrlForAllWidgets();
  });

  // Conditional display for Acara Hadir and Jumlah Tamu fields
  // ONLY show when "Hadir" is selected, hide for "Tidak Hadir" & "Masih Ragu"
  $(document).on('change', '#dg_rsvp_konfirmasi', function() {
    const konfirmasi = $(this).val();
    const form = $(this).closest('form');
    const prevKonfirmasi = $(this).data('dgRsvpLastKonfirmasi');
    $(this).data('dgRsvpLastKonfirmasi', konfirmasi);
    const acaraField = form.find('.dg-rsvp-select-acara');
    const jumlahField = form.find('.dg-rsvp-select-jumlah');
    const acaraSelect = form.find('#dg_rsvp_acara_hadir');
    const jumlahSelect = form.find('#dg_rsvp_jumlah_tamu');
    const jumlahHidden = form.find('#dg_rsvp_jumlah_tamu_hidden');
    const acaraHidden = form.find('#dg_rsvp_acara_hadir_hidden');

    if (konfirmasi === 'Hadir') {
      // Show fields when Hadir selected
      acaraField.removeClass('dg-rsvp-acara-url-hidden').slideDown(200);
      jumlahField.slideDown(200);
      
      // Set required attribute when showing
      acaraSelect.attr('required', 'required').attr('data-required', 'true');
      jumlahSelect.attr('required', 'required').attr('data-required', 'true');
      
      // Reset acara/jumlah hanya saat baru pindah ke Hadir (bukan re-trigger sebelum submit)
      if (prevKonfirmasi !== 'Hadir') {
        acaraSelect.val('');
        jumlahSelect.val('');
        acaraHidden.val('');
        jumlahHidden.val('');
      }

      applyAcaraUrlConditional(form[0]);
    } else if (konfirmasi === 'Tidak Hadir' || konfirmasi === 'Masih Ragu') {
      // Hide fields when Tidak Hadir or Masih Ragu selected
      acaraField.removeClass('dg-rsvp-acara-url-hidden');
      acaraField.slideUp(200);
      jumlahField.slideUp(200);
      
      // Remove required attribute
      acaraSelect.removeAttr('required').removeAttr('data-required');
      jumlahSelect.removeAttr('required').removeAttr('data-required');
      
      // Clear visible fields and set hidden field to 1 Pax
      acaraSelect.val('');
      jumlahSelect.val('');
      acaraHidden.val('');
      jumlahHidden.val('1 Pax');
    }
  });

  // Get Comments Link Click
  $(document).on('click', 'a.dg-rsvp-link', function (e) {
    e.preventDefault();
    const linkVars = getUrlVars($(this).attr('href'));
    const post_id = linkVars.post_id;
    const num_comments = linkVars.comments;
    const order_comments = linkVars.order;

    $("#dg-rsvp-wrap-comment-" + post_id).slideToggle(200);
    const $container_comment = $('#dg-rsvp-container-comment-' + post_id);

    if ($container_comment.length && $container_comment.html().length === 0) {
      getComments(post_id, num_comments, order_comments);
    }
    return false;
  });

  // Auto Load Comments — lewati di mode form-only (tanpa header komentar)
  if ($('a.dg-rsvp-link').length) {
    $('a.dg-rsvp-link.auto-load-true').each(function () {
      var $wrapper = $(this).closest('.dg-rsvp-wrapper');
      if ($wrapper.hasClass('dg-rsvp-form-only')) {
        return;
      }
      $(this).click();
    });
  }

  // Form-only: pastikan wrap komentar terbuka (hanya form)
  $('.dg-rsvp-form-only').each(function () {
    var $wrap = $(this).find('[id^="dg-rsvp-wrap-comment-"]');
    if ($wrap.length) {
      $wrap.show();
    }
  });

  // Submit Form
  $(document).on('submit', '.dg-rsvp-container-form form', function (event) {
    event.preventDefault();
    $(this).find(':submit').attr("disabled", "disabled");

    const formID = $(this).attr('id');
    const post_id = formID.replace('commentform-', '');
    const form = $('#commentform-' + post_id);
    const link_show_comments = $('#dg-rsvp-link-' + post_id);
    const widgetWrapper = form.closest('.dg-rsvp-wrapper');
    const locale = dgRsvpGetWrapperLocale(widgetWrapper);
    const isDigimo1Form = isDigimoForm(form);
    const attendanceHidden = dgRsvpIsAttendanceHidden(widgetWrapper);

    if (wrapperNeedsDigdataHydration(widgetWrapper)) {
      hydrateRsvpActionsFromDigdata(widgetWrapper);
    }

    if (isDigimo1Form && window.DG_RSVP_DIGIMO1 && typeof window.DG_RSVP_DIGIMO1.prepareSubmit === 'function') {
      window.DG_RSVP_DIGIMO1.prepareSubmit(form);
    }

    // Validation
    const content = form.find('textarea').val().trim();
    if (content.length < 2) {
      alert(dgRsvpT('alert_fill_wishes', locale, 'Silakan isi ucapan terlebih dahulu'));
      $(this).find(':submit').removeAttr('disabled');
      return false;
    }

    // Validate nama field
    const nama = form.find('#author').val().trim();
    const useNameDatabase = widgetWrapper.attr('data-use-name-database') === 'yes';
    const isOrganizer = isOrganizerMode(widgetWrapper);
    if (useNameDatabase && !isOrganizer) {
      const rejectMsg = widgetWrapper.attr('data-name-db-reject-message') || form.data('dgNameDbRejectMessage') || NAME_DB_REJECT_FALLBACK;
      const isValidGuest = !!form.data('dgNameDbValid');
      if (!isValidGuest) {
        alert(rejectMsg);
        $(this).find(':submit').removeAttr('disabled');
        return false;
      }
    }
    if (!nama) {
      alert(dgRsvpT('alert_fill_name', locale, 'Silakan isi nama Anda'));
      $(this).find(':submit').removeAttr('disabled');
      return false;
    }

    // Get konfirmasi value
    const konfirmasiField = form.find('#dg_rsvp_konfirmasi');
    let konfirmasi = '';

    if (isDigimo1Form && !attendanceHidden) {
      konfirmasi = konfirmasiField.length ? konfirmasiField.val() : '';
      if (konfirmasiField.length && konfirmasiField.attr('type') !== 'hidden' && !konfirmasi) {
        alert(dgRsvpT('alert_select_attendance', locale, 'Silakan pilih status kehadiran'));
        $(this).find(':submit').removeAttr('disabled');
        return false;
      }
      if (konfirmasi === 'Hadir') {
        const acaraSelect = form.find('#dg_rsvp_acara_hadir');
        if (acaraSelect.length && !acaraSelect.prop('disabled')) {
          let acara = acaraSelect.val() || form.find('#dg_rsvp_acara_hadir_hidden').val() || '';
          if (isInvalidAcaraValue(acara)) {
            acara = '';
          }
          if (!acara) {
            alert(dgRsvpT('alert_select_event', locale, 'Silakan pilih acara'));
            $(this).find(':submit').removeAttr('disabled');
            return false;
          }
          acaraSelect.val(acara);
          form.find('#dg_rsvp_acara_hadir_hidden').val(acara);
        }
        const jumlahVal = form.find('#dg_rsvp_jumlah_tamu').val() || form.find('#dg_rsvp_jumlah_tamu_hidden').val();
        if (!jumlahVal) {
          alert(dgRsvpT('alert_select_guests', locale, 'Silakan pilih jumlah tamu'));
          $(this).find(':submit').removeAttr('disabled');
          return false;
        }
      }
    } else if (!isDigimo1Form && !attendanceHidden && konfirmasiField.length && konfirmasiField.attr('type') !== 'hidden' && konfirmasiField.is(':visible')) {
      konfirmasi = konfirmasiField.val();
      if (!konfirmasi) {
        alert(dgRsvpT('alert_select_attendance', locale, 'Silakan pilih status kehadiran'));
        $(this).find(':submit').removeAttr('disabled');
        return false;
      }
      if (konfirmasi === 'Hadir') {
        const acaraSelect = form.find('#dg_rsvp_acara_hadir');
        if (acaraSelect.length && acaraSelect.is(':visible')) {
          const acara = acaraSelect.val();
          if (!acara) {
            alert(dgRsvpT('alert_select_event', locale, 'Silakan pilih acara'));
            $(this).find(':submit').removeAttr('disabled');
            return false;
          }
        }
        const jumlahSelect = form.find('#dg_rsvp_jumlah_tamu');
        if (jumlahSelect.length && jumlahSelect.is(':visible')) {
          const jumlah = jumlahSelect.val();
          if (!jumlah) {
            alert(dgRsvpT('alert_select_guests', locale, 'Silakan pilih jumlah tamu'));
            $(this).find(':submit').removeAttr('disabled');
            return false;
          }
        }
      }
    } else if (konfirmasiField.length) {
      konfirmasi = konfirmasiField.val();
    }

    // Get jumlah tamu - use hidden field if visible field is empty (for non-Hadir)
    let jumlah_tamu = form.find('#dg_rsvp_jumlah_tamu').val();
    if (!jumlah_tamu) {
      jumlah_tamu = form.find('#dg_rsvp_jumlah_tamu_hidden').val() || '1 Pax';
    }

    // Check nama lock
    const lockNama = widgetWrapper.attr('data-lock-nama');
    if (lockNama === 'true') {
      const authorField = form.find('#author');
      if (authorField.length && !authorField.val()) {
        alert(dgRsvpT('alert_fill_name', locale, 'Silakan isi nama Anda'));
        $(this).find(':submit').removeAttr('disabled');
        return false;
      }
    }

    const isReply = isReplySubmit(form);

    if (isReply || isWpCommentEnabled(widgetWrapper)) {
      insertComment(post_id, form, link_show_comments, $(this));
      return false;
    }

    if (isDashboardSaasEnabled(widgetWrapper)) {
      alert(dgRsvpT('alert_dashboard_saas', locale, 'Dashboard SaaS memerlukan komentar WordPress aktif.'));
      $(this).find(':submit').removeAttr('disabled');
      return false;
    }

    if (!hasExternalSubmitChannel(widgetWrapper)) {
      alert(dgRsvpT('alert_no_storage', locale, 'Aktifkan minimal satu tujuan penyimpanan: Komentar WordPress, WhatsApp, Google Sheet, atau Guestbook API.'));
      $(this).find(':submit').removeAttr('disabled');
      return false;
    }

    submitWithoutComment(post_id, form, link_show_comments, $(this));

    return false;
  });

  // Get URL Variables
  function getUrlVars(url) {
    const vars = {};
    const parts = url.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
      vars[key] = value;
    });
    return vars;
  }

  // Get Comments Function (Based on Comment Kit 2)
  function getComments(post_id, num_comments, order_comments) {
    const status = $('#dg-rsvp-comment-status-' + post_id);
    const $container_comments = $("ul#dg-rsvp-container-comment-" + post_id);

    if (num_comments > 0) {
      // Detect preview mode and get actual post ID
      var urlParams = new URLSearchParams(window.location.search);
      var preview_id = urlParams.get('preview_id');

      var $wrapper = $('#dg-rsvp-link-' + post_id).closest('.dg-rsvp-wrapper');
      var locale = dgRsvpGetWrapperLocale($wrapper);

      jQuery.ajax({
        type: "POST",
        dataType: "html",
        url: DG_RSVP.ajaxurl,
        data: {
          action: 'dg_get_rsvp_comments',
          post_id: post_id,
          preview_id: preview_id || '',
          get: 100,
          order: order_comments,
          locale: locale,
          nonce: DG_RSVP.nonce
        },
        beforeSend: function () {
          status.addClass('dg-rsvp-loading').html('<span class="dg-rsvpo-loading"></span>').show();
        },
        success: function (data) {
          status.removeClass('dg-rsvp-loading').html('').hide();
          $container_comments.html(data).show();

          // Baca setting pagination per-widget dari data attributes wrapper
          var $wrapper = $('#dg-rsvp-link-' + post_id).closest('.dg-rsvp-wrapper');
          var paginationEnabled = $wrapper.attr('data-pagination') === 'true';
          var perPage = parseInt($wrapper.attr('data-per-page'), 10) || DG_RSVP.numPerPage;
          var totalComments = $container_comments.find('>li').length;

          // Initialize jPages hanya jika pagination diaktifkan di widget
          if (typeof jQuery.fn.jPages == 'function' && paginationEnabled) {
            var $box = $wrapper.find('.dg-rsvp-box');
            var holder = 'div.dg-rsvp-holder-' + post_id;
            if (totalComments > perPage) {
              $(holder).show(); // holder default display:none — harus show sebelum jPages init
              $(holder).jPages({
                containerID: 'dg-rsvp-container-comment-' + post_id,
                previous: "← " + DG_RSVP.textNavPrev,
                next: DG_RSVP.textNavNext + " →",
                perPage: perPage,
                minHeight: false,
                keyBrowse: true,
                direction: "forward",
                animation: "fadeIn",
                callback: function() {
                  // Scroll ke atas dg-rsvp-box saat ganti halaman
                  $box.scrollTop(0);
                }
              });
            }
          }
        },
        error: function (jqXHR, textStatus, errorThrown) {
          status.removeClass('dg-rsvp-loading').html('<p class="dg-rsvp-ajax-error">Error loading comments</p>');
        },
        complete: function (jqXHR, textStatus) {
        }
      });
    }
    return false;
  }

  /**
   * UI sukses setelah submit (komentar WP atau form-only tanpa komentar).
   */
  function handleRsvpSubmitSuccess(post_id, form, link_show_comments, submitBtn, formDataObj, options) {
    options = options || {};
    const status = $('#dg-rsvp-comment-status-' + post_id);
    const commentHtml = options.commentHtml || '';
    const $widgetWrapper = form.closest('.dg-rsvp-wrapper');
    const locale = dgRsvpGetWrapperLocale($widgetWrapper);
    const thanksMsg = dgRsvpT('thanks_comment', locale, DG_RSVP.thanksComment);

    status.html('<p class="dg-rsvp-ajax-success">' + thanksMsg + '</p>');

    if (commentHtml && link_show_comments && link_show_comments.length) {
      const linkText = link_show_comments.text();
      const numMatch = linkText.match(/(\d+)/);
      const commentIdMatch = commentHtml.match(/id=['"]dg-rsvp-item-comment-(\d+)['"]/i);
      const wasUpsert = !!(commentIdMatch && commentIdMatch[1] && $('#dg-rsvp-item-comment-' + commentIdMatch[1]).length);
      if (numMatch && !wasUpsert) {
        const num = parseInt(numMatch[1], 10) + 1;
        link_show_comments.html(linkText.replace(/\d+/, num));
      }
    }

    const $container = $('ul#dg-rsvp-container-comment-' + post_id);
    if (commentHtml && $container.length) {
      const parentCommentId = formDataObj.comment_parent;
      const commentIdMatch = commentHtml.match(/id=['"]dg-rsvp-item-comment-(\d+)['"]/i);
      if (commentIdMatch && commentIdMatch[1] && (!parentCommentId || parentCommentId === '0')) {
        $('#dg-rsvp-item-comment-' + commentIdMatch[1]).remove();
      }
      if (parentCommentId && parentCommentId !== '0') {
        const $parentLi = $('#dg-rsvp-item-comment-' + parentCommentId);
        if ($parentLi.length) {
          let $children = $parentLi.children('ul.children');
          if (!$children.length) {
            $parentLi.append('<ul class="children"></ul>');
            $children = $parentLi.children('ul.children');
          }
          $children.append(commentHtml);
        } else {
          $container.prepend(commentHtml).show();
        }
      } else {
        $container.prepend(commentHtml).show();
      }

      var $wrapper = form.closest('.dg-rsvp-wrapper');
      var paginationEnabled = $wrapper.attr('data-pagination') === 'true';
      var perPage = parseInt($wrapper.attr('data-per-page'), 10) || DG_RSVP.numPerPage;
      var $box = $wrapper.find('.dg-rsvp-box');

      if (typeof jQuery.fn.jPages == 'function' && paginationEnabled) {
        var holder = 'div.dg-rsvp-holder-' + post_id;
        var num_comments = $container.find('>li').length;
        if (num_comments > perPage) {
          if ($(holder).data('jPages')) {
            $(holder).jPages('destroy');
          }
          $container.children().removeClass('animated jp-hidden');
          $(holder).show();
          $(holder).jPages({
            containerID: 'dg-rsvp-container-comment-' + post_id,
            previous: "← " + DG_RSVP.textNavPrev,
            next: DG_RSVP.textNavNext + " →",
            perPage: perPage,
            minHeight: false,
            keyBrowse: true,
            direction: "forward",
            animation: "fadeIn",
            callback: function() {
              $box.scrollTop(0);
            }
          });
        }
      }
    }

    const isDigimo1 = isDigimoWrapper($widgetWrapper);
    const isFormOnly = $widgetWrapper.hasClass('dg-rsvp-form-only');
    const enableWa = $widgetWrapper.attr('data-enable-wa') === 'yes';
    const wasReply = (formDataObj.comment_parent && formDataObj.comment_parent !== '0');
    normalizeRsvpFormData(formDataObj);

    if (!isDigimo1 || enableWa) {
      form.find('textarea').val('');
      form.find('select').prop('selectedIndex', 0);
      form.find('#dg_rsvp_jumlah_tamu_hidden').val('1 Pax');
      form.find('#dg_rsvp_acara_hadir_hidden').val('');
      form.find('.dg-rsvp-select-acara').hide();
      form.find('.dg-rsvp-select-jumlah').hide();
    }

    form.find('#comment_parent').val('0');
    form.removeData('dg-reply-mode');
    form.closest('.dg-rsvp-wrapper').find('.dg-rsvp-reply-indicator').hide();

    var $konfWrapAfter = form.find('.dg-rsvp-select-konfirmasi');
    if ($konfWrapAfter.data('dg-was-visible')) {
      $konfWrapAfter.show().removeData('dg-was-visible');
    }

    if (typeof autosize !== 'undefined') {
      autosize.update(form.find('textarea'));
    }

    if (!isFormOnly && !isDigimo1) {
      setTimeout(function() {
        const formWrap = form.closest('.dg-rsvp-clearfix.dg-rsvp-wrap-form');
        if (formWrap.length) {
          formWrap.slideUp(400);
        }
      }, 1500);
    }

    if (!wasReply) {
      setTimeout(function() {
        const $wrapper = form.closest('.dg-rsvp-wrapper');
        ensureDigdataForRsvp($wrapper).then(function() {
          executeRedirects(post_id, formDataObj, form);
        });
      }, 100);
    }

    if (isDigimo1 && !wasReply && !enableWa) {
      if (window.DG_RSVP_DIGIMO1 && typeof window.DG_RSVP_DIGIMO1.showSuccess === 'function') {
        window.DG_RSVP_DIGIMO1.showSuccess(form);
      }
    }

    submitBtn.find(':submit').removeAttr('disabled');

    setTimeout(function () {
      status.removeClass('dg-rsvp-loading').fadeOut(600);
    }, 2500);
  }

  // Insert Comment Function
  function insertComment(post_id, form, link_show_comments, submitBtn) {
    const status = $('#dg-rsvp-comment-status-' + post_id);

    if (!form.find('input[name="commentpress"]').length && !form.find('input[name="comment_press"]').length) {
      form.append('<input type="hidden" name="commentpress" value="true">');
    }

    hydrateRsvpFormNameFromDigdata(form.closest('.dg-rsvp-wrapper'));

    const form_data = form.serialize();
    const formDataObj = syncRsvpFormNameFromDom(form, form.serializeArray().reduce((obj, item) => {
      obj[item.name] = item.value;
      return obj;
    }, {}));

    $.ajax({
      type: 'post',
      method: 'post',
      url: form.attr('action'),
      data: form_data,
      dataType: "html",
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      beforeSend: function () {
        status.addClass('dg-rsvp-loading').html('<span class="dg-rsvpo-loading"></span>').show();
      },
      success: function (data, textStatus) {
        status.removeClass('dg-rsvp-loading').html('');

        if (data != "error" && data.trim() !== "" && (data.indexOf('<li') !== -1 || data.indexOf('dg-rsvp-item-comment') !== -1)) {
          handleRsvpSubmitSuccess(post_id, form, link_show_comments, submitBtn, formDataObj, {
            commentHtml: data
          });
        } else {
          status.html('<p class="dg-rsvp-ajax-error">' + dgRsvpT('alert_submit_failed', dgRsvpGetWrapperLocale(form.closest('.dg-rsvp-wrapper')), 'Gagal memproses form. Silakan coba lagi.') + '</p>');
          submitBtn.find(':submit').removeAttr('disabled');
        }
      },
      error: function () {
        status.removeClass('dg-rsvp-loading').html('<p class="dg-rsvp-ajax-error">' + DG_RSVP.duplicateComment + '</p>');
        submitBtn.find(':submit').removeAttr('disabled');
      }
    });

    return false;
  }

  // Submit tanpa menyimpan komentar WordPress (form-only + channel eksternal)
  function submitWithoutComment(post_id, form, link_show_comments, submitBtn) {
    const status = $('#dg-rsvp-comment-status-' + post_id);

    hydrateRsvpFormNameFromDigdata(form.closest('.dg-rsvp-wrapper'));

    const formDataObj = syncRsvpFormNameFromDom(form, form.serializeArray().reduce((obj, item) => {
      obj[item.name] = item.value;
      return obj;
    }, {}));

    $.ajax({
      type: 'POST',
      url: DG_RSVP.ajaxurl,
      dataType: 'json',
      data: {
        action: 'dg_rsvp_submit_without_comment',
        nonce: DG_RSVP.nonce,
        post_id: post_id,
        author: formDataObj.author || '',
        comment: formDataObj.comment || ''
      },
      beforeSend: function () {
        status.addClass('dg-rsvp-loading').html('<span class="dg-rsvpo-loading"></span>').show();
      },
      success: function (response) {
        status.removeClass('dg-rsvp-loading').html('');

        if (response && response.success) {
          handleRsvpSubmitSuccess(post_id, form, link_show_comments, submitBtn, formDataObj, {});
        } else {
          const msg = (response && response.data && response.data.message)
            ? response.data.message
            : 'Gagal memproses form. Silakan coba lagi.';
          status.html('<p class="dg-rsvp-ajax-error">' + msg + '</p>');
          submitBtn.find(':submit').removeAttr('disabled');
        }
      },
      error: function () {
        status.removeClass('dg-rsvp-loading').html('<p class="dg-rsvp-ajax-error">Gagal memproses form. Silakan coba lagi.</p>');
        submitBtn.find(':submit').removeAttr('disabled');
      }
    });

    return false;
  }

  /**
   * Config sheet/guestbook disimpan server-side (PHP render + saat submit Sheet).
   * Tidak ada auto-save AJAX on-load — itu yang spam admin-ajax di Elementor preview.
   */

  function digdataScalarForRsvp(raw) {
    if (raw === null || typeof raw === 'undefined') {
      return '';
    }
    if (typeof raw === 'boolean') {
      return raw ? 'yes' : 'no';
    }
    if (typeof raw === 'number') {
      return String(raw);
    }
    if (typeof raw === 'string') {
      return raw.trim();
    }
    if (typeof raw === 'object') {
      if (raw.value !== undefined && raw.value !== null) {
        return digdataScalarForRsvp(raw.value);
      }
      if (raw.url) {
        return String(raw.url).trim();
      }
      if (raw.text) {
        return String(raw.text).trim();
      }
    }
    return '';
  }

  function digdataRsvpPickValue(data, section, key) {
    if (!data || !key) {
      return '';
    }
    if (typeof digdataGetPayloadValue === 'function') {
      return digdataScalarForRsvp(digdataGetPayloadValue(data, section || '', key));
    }
    if (section && data[section] && typeof data[section] === 'object' && data[section][key] !== undefined) {
      return digdataScalarForRsvp(data[section][key]);
    }
    if (data[key] !== undefined) {
      return digdataScalarForRsvp(data[key]);
    }
    return '';
  }

  function applyDigdataYesNoAttr($wrapper, attr, section, key, data) {
    const val = digdataRsvpPickValue(data, section, key);
    if (!val) {
      return;
    }
    const norm = String(val).toLowerCase();
    if (norm === 'yes' || norm === '1' || norm === 'true') {
      $wrapper.attr(attr, 'yes');
    } else if (norm === 'no' || norm === '0' || norm === 'false') {
      $wrapper.attr(attr, 'no');
    }
  }

  function digdataRsvpApplyAffixes(val, before, after) {
    if (!val) {
      return '';
    }
    return (before || '') + val + (after || '');
  }

  function digdataRsvpPickValueWithAffixes(data, section, key, before, after) {
    return digdataRsvpApplyAffixes(
      digdataRsvpPickValue(data, section, key),
      before,
      after
    );
  }

  function hydrateRsvpFormNameFromDigdata($wrapper) {
    if (!$wrapper || !$wrapper.length) {
      return;
    }

    const formNameKey = $wrapper.attr('data-digdata-form-name-key');
    if (!formNameKey) {
      return;
    }

    const data = window.digdataApiData || window.DG_API_DATA || null;
    if (!data) {
      return;
    }

    const formNameVal = digdataRsvpPickValueWithAffixes(
      data,
      $wrapper.attr('data-digdata-form-name-section') || '',
      formNameKey,
      $wrapper.attr('data-digdata-form-name-before') || '',
      $wrapper.attr('data-digdata-form-name-after') || ''
    );
    if (!formNameVal) {
      return;
    }

    const $input = $wrapper.find('input[name="dg_rsvp_form_name"]');
    if ($input.length) {
      $input.val(formNameVal);
    }
  }

  function hydrateRsvpActionsFromDigdata($wrapper) {
    if (!$wrapper || !$wrapper.length) {
      return;
    }

    hydrateRsvpFormNameFromDigdata($wrapper);

    const data = window.digdataApiData || window.DG_API_DATA || null;
    if (!data) {
      return;
    }

    const enableWaKey = $wrapper.attr('data-digdata-enable-wa-key');
    if (enableWaKey) {
      applyDigdataYesNoAttr(
        $wrapper,
        'data-enable-wa',
        $wrapper.attr('data-digdata-enable-wa-section') || '',
        enableWaKey,
        data
      );
    }

    if ($wrapper.attr('data-enable-wa') === 'yes') {
      const waKey = $wrapper.attr('data-digdata-wa-key');
      if (waKey) {
        const waNum = digdataRsvpPickValueWithAffixes(
          data,
          $wrapper.attr('data-digdata-wa-section') || '',
          waKey,
          $wrapper.attr('data-digdata-wa-before') || '',
          $wrapper.attr('data-digdata-wa-after') || ''
        );
        if (waNum) {
          $wrapper.attr('data-wa-number', waNum);
          window.DG_RSVP_WA_NUMBER = waNum;
        }
      }

      const tplKey = $wrapper.attr('data-digdata-wa-template-key');
      if (tplKey) {
        const tpl = digdataRsvpPickValueWithAffixes(
          data,
          $wrapper.attr('data-digdata-wa-template-section') || '',
          tplKey,
          $wrapper.attr('data-digdata-wa-template-before') || '',
          $wrapper.attr('data-digdata-wa-template-after') || ''
        );
        if (tpl) {
          $wrapper.attr('data-wa-template', tpl);
        }
      }
    }

    const enableSheetKey = $wrapper.attr('data-digdata-enable-sheet-key');
    if (enableSheetKey) {
      applyDigdataYesNoAttr(
        $wrapper,
        'data-enable-sheet',
        $wrapper.attr('data-digdata-enable-sheet-section') || '',
        enableSheetKey,
        data
      );
    }

    if ($wrapper.attr('data-enable-sheet') === 'yes') {
      const sheetKey = $wrapper.attr('data-digdata-sheet-key');
      if (sheetKey) {
        const sheetUrl = digdataRsvpPickValueWithAffixes(
          data,
          $wrapper.attr('data-digdata-sheet-section') || '',
          sheetKey,
          $wrapper.attr('data-digdata-sheet-before') || '',
          $wrapper.attr('data-digdata-sheet-after') || ''
        );
        if (sheetUrl) {
          $wrapper.attr('data-sheet-url', sheetUrl);
          window.DG_RSVP_SHEET_URL = sheetUrl;
        }
      }
    }
  }

  function wrapperNeedsDigdataHydration($wrapper) {
    if (!$wrapper || !$wrapper.length) {
      return false;
    }
    return !!(
      $wrapper.attr('data-digdata-form-name-key') ||
      $wrapper.attr('data-digdata-wa-key') ||
      $wrapper.attr('data-digdata-wa-template-key') ||
      $wrapper.attr('data-digdata-enable-wa-key') ||
      $wrapper.attr('data-digdata-sheet-key') ||
      $wrapper.attr('data-digdata-enable-sheet-key') ||
      $wrapper.attr('data-wa-use-digdata') === 'true' ||
      $wrapper.attr('data-sheet-use-digdata') === 'true'
    );
  }

  function ensureDigdataForRsvp($wrapper) {
    return new Promise(function(resolve) {
      hydrateRsvpActionsFromDigdata($wrapper);

      if (!wrapperNeedsDigdataHydration($wrapper) || window.digdataApiData) {
        resolve();
        return;
      }

      if (typeof window.initDigdataInjection === 'function') {
        try {
          window.initDigdataInjection(document, false);
        } catch (eInit) {}
      }

      let tries = 0;
      const timer = setInterval(function() {
        tries += 1;
        if (window.digdataApiData) {
          clearInterval(timer);
          hydrateRsvpActionsFromDigdata($wrapper);
          resolve();
          return;
        }
        if (tries >= 30) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  // After-submit pipeline: WhatsApp first, then Sheet/Guestbook after config persistence.
  function runWhatsAppRedirect(widgetWrapper, formData) {
    if (widgetWrapper.attr('data-enable-wa') !== 'yes') {
      return;
    }

    const waNumber = window.DG_RSVP_WA_NUMBER || widgetWrapper.attr('data-wa-number');
    const waTemplate = widgetWrapper.attr('data-wa-template');
    if (waNumber && waTemplate) {
      sendToWhatsApp(waNumber, waTemplate, formData, getGuestSuffixFromWrapper(widgetWrapper));
    }
  }

  function runExternalDataChannels(post_id, widgetWrapper, formData) {
    let form_name = formData.dg_rsvp_form_name || '';
    if (!form_name) {
      form_name = widgetWrapper.find('input[name="dg_rsvp_form_name"]').val() || 'Form 1';
      formData.dg_rsvp_form_name = form_name;
    }
    const enableSheet = widgetWrapper.attr('data-enable-sheet') === 'yes';
    const enableGuestbook = widgetWrapper.attr('data-enable-guestbook') === 'yes';
    const sheetUrlFallback = window.DG_RSVP_SHEET_URL || widgetWrapper.attr('data-sheet-url') || '';
    const actions = [];

    if (enableSheet) {
      if (!sheetUrlFallback) {
        if (window.console && typeof window.console.warn === 'function') {
          console.warn('[DG RSVP] Sheet aktif tapi data-sheet-url kosong.');
        }
      } else {
        actions.push(function() {
          return sendToGoogleSheet(post_id, form_name, formData, sheetUrlFallback);
        });
      }
    }
    if (enableGuestbook) {
      actions.push(function() {
        return sendToGuestbook(post_id, form_name, formData);
      });
    }

    if (!actions.length) {
      return;
    }

    Promise.allSettled(actions.map(function(fn) { return fn(); }))
      .then(function(results) {
        results.forEach(function(result) {
          if (result.status === 'rejected' && window.console && typeof window.console.warn === 'function') {
            console.warn('[DG RSVP] Channel eksternal gagal:', result.reason);
          }
        });
      })
      .catch(function() {
        // Silent fail for production
      });
  }

  function executeRedirects(post_id, formData, form) {
    const widgetWrapper = form.closest('.dg-rsvp-wrapper');

    if (!widgetWrapper.length) {
      return;
    }

    hydrateRsvpActionsFromDigdata(widgetWrapper);
    formData = normalizeRsvpFormData(formData || {});
    formData = syncRsvpFormNameFromDom(form, formData);

    const guestSuffix = getGuestSuffixFromWrapper(widgetWrapper);
    if (formData.dg_rsvp_jumlah_tamu) {
      formData.dg_rsvp_jumlah_tamu = formatJumlahTamuForExport(formData.dg_rsvp_jumlah_tamu, guestSuffix);
    }

    runWhatsAppRedirect(widgetWrapper, formData);
    runExternalDataChannels(post_id, widgetWrapper, formData);
  }

  // Helper: Normalize phone number to WhatsApp format
  function normalizePhoneNumber(phone) {
    let clean = phone.replace(/[^\d]/g, '');

    if (clean.startsWith('08')) {
      clean = '62' + clean.slice(1);
    }
    else if (clean.startsWith('8') && !clean.startsWith('62')) {
      clean = '62' + clean;
    }
    else if (!clean.startsWith('62')) {
      clean = '62' + clean;
    }

    return clean;
  }

  // Helper: Parse template with placeholders
  // Supports both %placeholder% and {placeholder} formats
  function parseTemplate(template, data) {
    let result = template;

    // Get API data from window global
    const apiData = window.DG_API_DATA || {};

    const jumlahTamuFormatted = formatJumlahTamuForExport(
      data.jumlah_tamu,
      data.guest_suffix || 'Pax'
    );

    // Add dynamic tags support: {nama}, {konfirmasi}, etc.
    const dynamicTags = {
      '{nama}': data.nama || data.author || '',
      '{konfirmasi}': data.kehadiran || data.konfirmasi || '',
      '{acara}': data.acara_hadir || '',
      '{acara_hadir}': data.acara_hadir || '', // Alias for {acara}
      '{jumlah}': jumlahTamuFormatted,
      '{jumlah_tamu}': jumlahTamuFormatted,
      '{ucapan}': data.ucapan || '',
      '{pesan}': data.ucapan || '',
      '{form_name}': data.form_name || '',
      '{source}': data.source || '',
      '{date}': new Date().toLocaleDateString('id-ID'),
      '{time}': new Date().toLocaleTimeString('id-ID'),
      '{site_name}': window.location.hostname,
      '{site_url}': window.location.origin,
      // API tags
      '{api_acara1}': apiData.acara1 || '',
      '{api_acara2}': apiData.acara2 || '',
      '{api_acara3}': apiData.acara3 || '',
      '{api_wa_konfirmasi}': apiData.nomor_wa_konfirmasi || '',
      '{api_url_sheet}': apiData.url_sheet_rsvp || ''
    };

    // Replace dynamic tags {placeholder}
    Object.keys(dynamicTags).forEach(tag => {
      const value = dynamicTags[tag];
      const isEmpty = value === null || value === undefined ||
                     (typeof value === 'string' && value.trim() === '') ||
                     value === '';
      const replacement = isEmpty ? '-' : String(value);
      result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), replacement);
    });

    // Support legacy %placeholder% format
    const placeholders = result.match(/%[^%]+%/g) || [];
    placeholders.forEach(placeholder => {
      const key = placeholder.replace(/%/g, '');
      let value = data[key];

      const isEmpty = value === null || value === undefined ||
                     (typeof value === 'string' && value.trim() === '') ||
                     value === '';

      const replacement = isEmpty ? '-' : String(value);
      result = result.replace(new RegExp(`%${key}%`, 'g'), replacement);
    });

    return result;
  }

  // Send to WhatsApp with Promise
  function sendToWhatsApp(waNumber, template, formData, guestSuffix) {
    return new Promise((resolve, reject) => {
      try {
        const jumlahFormatted = formatJumlahTamuForExport(
          formData.dg_rsvp_jumlah_tamu || '',
          guestSuffix || 'Pax'
        );

        // Map formData to template-friendly format
        const mappedData = {
          nama: formData.author || '',
          kehadiran: formData.dg_rsvp_konfirmasi || '',
          acara_hadir: formData.dg_rsvp_acara_hadir || '',
          jumlah: jumlahFormatted,
          jumlah_tamu: jumlahFormatted,
          guest_suffix: guestSuffix || 'Pax',
          ucapan: formData.comment || '',
          form_name: formData.dg_rsvp_form_name || '',
          source: formData.dg_rsvp_source || ''
        };

        const message = parseTemplate(template, mappedData);
        const normalizedPhone = normalizePhoneNumber(waNumber);
        const url = `https://api.whatsapp.com/send/?phone=${normalizedPhone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;

        window.open(url, '_blank');
        resolve('whatsapp');
      } catch (error) {
        reject(error);
      }
    });
  }

  // Send to Google Sheet (sheet_url: post meta + fallback dari DOM/API)
  function sendToGoogleSheet(post_id, form_name, formData, sheetUrlFallback) {
    return new Promise((resolve, reject) => {
      const payload = {
        action: 'dg_rsvp_send_to_sheet',
        nonce: DG_RSVP.nonce,
        post_id: post_id,
        form_name: form_name || 'Form 1',
        sheet_url: sheetUrlFallback || '',
        dg_idform: formData.dg_idform || '0',
        source: formData.dg_rsvp_source || '',
        nama: formData.author || '',
        konfirmasi: formData.dg_rsvp_konfirmasi || '',
        acara_hadir: formData.dg_rsvp_acara_hadir || '',
        jumlah_tamu: formData.dg_rsvp_jumlah_tamu || '',
        ucapan: formData.comment || ''
      };

      jQuery.ajax({
        type: 'POST',
        url: DG_RSVP.ajaxurl,
        dataType: 'json',
        data: payload,
        success: function(response) {
          if (response && response.success) {
            resolve('sheet');
            return;
          }
          const msg = (response && response.data && response.data.message)
            ? response.data.message
            : 'Gagal kirim ke Sheet';
          if (window.console && typeof window.console.warn === 'function') {
            console.warn('[DG RSVP] Sheet error:', msg);
          }
          reject(new Error(msg));
        },
        error: function(xhr, status, error) {
          if (window.console && typeof window.console.warn === 'function') {
            console.warn('[DG RSVP] Sheet AJAX error:', status, error);
          }
          reject(new Error(error || status || 'sheet_ajax_error'));
        }
      });
    });
  }

  // Send to Guestbook API — proxy WordPress → API eksternal (tanpa CORS di browser)
  function sendToGuestbook(post_id, form_name, formData) {
    return new Promise((resolve) => {
      const payload = {
        action: 'dg_rsvp_send_to_guestbook',
        nonce: DG_RSVP.nonce,
        post_id: post_id,
        form_name: form_name,
        api_url: GUESTBOOK_API_DEFAULT,
        buku_tamu_id: formData.dg_rsvp_source || '',
        nama: formData.author || '',
        jumlah_tamu: formData.dg_rsvp_jumlah_tamu || '1',
        ucapan: formData.comment || '',
        kehadiran: formData.dg_rsvp_konfirmasi || 'Hadir',
        acara: formData.dg_rsvp_acara_hadir || '',
        timestamp: new Date().toISOString()
      };

      jQuery.ajax({
        type: 'POST',
        url: DG_RSVP.ajaxurl,
        data: payload,
        timeout: 8000,
        success: function(response) {
          resolve('guestbook');
        },
        error: function(xhr, status, error) {
          resolve('guestbook');
        }
      });
    });
  }

  // ============================================================
  // Organizer Mode Detection & Reply / Edit / Delete Handlers
  // ============================================================
  function getModeratorKeyForWrapper($wrapper) {
    if (!$wrapper || !$wrapper.length) return '';
    var paramName = $wrapper.attr('data-organizer-param-key') || 'admin';
    return new URLSearchParams(window.location.search).get(paramName) || '';
  }

  // Activate organizer mode on matching wrappers
  $('.dg-rsvp-wrapper').each(function() {
    var $wrapper = $(this);
    var editKey = $wrapper.attr('data-edit-key') || '';
    var urlKey = getModeratorKeyForWrapper($wrapper);
    if (isAdminMode || (urlKey !== '' && editKey !== '' && urlKey === editKey)) {
      $(this).addClass('dg-rsvp-e-comment-mode');
    }
  });

  // ---- Reply Handler ----
  $(document).on('click', '.dg-rsvp-reply-link', function(e) {
    e.preventDefault();
    var $link      = $(this);
    var commentId  = $link.data('comment-id');
    var authorName = $link.data('author-name');
    var $wrapper   = $link.closest('.dg-rsvp-wrapper');
    var $form      = $wrapper.find('form[id^="commentform-"]');

    // Set comment_parent hidden field
    $form.find('#comment_parent').val(commentId);

    // Tandai form dalam mode reply
    $form.data('dg-reply-mode', true);

    // Sembunyikan field RSVP (konfirmasi/acara/jumlah) — tidak relevan untuk balasan
    var $konfWrap = $form.find('.dg-rsvp-select-konfirmasi');
    if ($konfWrap.length && $konfWrap.is(':visible')) {
      $konfWrap.hide().data('dg-was-visible', true);
      $form.find('#dg_rsvp_konfirmasi').removeAttr('required');
    }
    $form.find('.dg-rsvp-select-acara').hide();
    $form.find('.dg-rsvp-select-jumlah').hide();
    $form.find('#dg_rsvp_acara_hadir').removeAttr('required');
    $form.find('#dg_rsvp_jumlah_tamu').removeAttr('required');

    // Show / update reply indicator
    var $indicator = $wrapper.find('.dg-rsvp-reply-indicator');
    var safeAuthor = $('<span>').text(authorName).html();
    if (!$indicator.length) {
      $wrapper.find('.dg-rsvp-wrap-textarea').before(
        '<div class="dg-rsvp-reply-indicator">' +
          '<span class="dg-rsvp-replying-to">Membalas <strong>' + safeAuthor + '</strong></span>' +
          '<a href="#" class="dg-rsvp-cancel-reply">× Batal</a>' +
        '</div>'
      );
    } else {
      $indicator.find('.dg-rsvp-replying-to').html('Membalas <strong>' + safeAuthor + '</strong>');
      $indicator.show();
    }

    // Ensure form is visible
    var $formWrap = $wrapper.find('.dg-rsvp-clearfix.dg-rsvp-wrap-form');
    if ($formWrap.is(':hidden')) {
      $formWrap.slideDown(300);
    }

    // Scroll to textarea & focus
    var $textarea = $wrapper.find('.dg-rsvp-wrap-textarea');
    if ($textarea.length && $textarea.offset()) {
      $('html, body').animate({
        scrollTop: $textarea.offset().top - 100
      }, 400);
    }
    $wrapper.find('textarea.dg-rsvp-textarea').focus();
  });

  // ---- Cancel Reply ----
  $(document).on('click', '.dg-rsvp-cancel-reply', function(e) {
    e.preventDefault();
    var $wrapper = $(this).closest('.dg-rsvp-wrapper');
    var $form    = $wrapper.find('form[id^="commentform-"]');

    // Reset comment_parent
    $form.find('#comment_parent').val('0');

    // Hapus reply mode flag
    $form.removeData('dg-reply-mode');

    // Restore field RSVP yang disembunyikan
    var $konfWrap = $form.find('.dg-rsvp-select-konfirmasi');
    if ($konfWrap.data('dg-was-visible')) {
      $konfWrap.show().removeData('dg-was-visible');
    }

    // Sembunyikan indikator reply
    $(this).closest('.dg-rsvp-reply-indicator').hide();
  });

  // ---- Edit Handler: click Edit link ----
  $(document).on('click', '.dg-rsvp-edit-link', function(e) {
    e.preventDefault();
    var commentId  = $(this).data('comment-id');
    var $textDiv   = $('#dg-rsvp-comment-' + commentId).find('.dg-rsvp-comment-text');

    // Skip if already in edit mode
    if ($textDiv.hasClass('dg-rsvp-edit-mode')) return;

    // Cache original HTML
    $textDiv.data('original-html', $textDiv.html());

    $.ajax({
      type: 'POST',
      url: DG_RSVP.ajaxurl,
      data: {
        action:     'dg_get_rsvp_comment_text',
        nonce:      DG_RSVP.nonce,
        comment_id: commentId,
        edit_key:   getModeratorKeyForWrapper($(this).closest('.dg-rsvp-wrapper'))
      },
      success: function(response) {
        if (response.success) {
          var rawText = response.data.text;
          $textDiv.addClass('dg-rsvp-edit-mode').html(
            '<textarea class="dg-rsvp-edit-textarea">' + $('<div>').text(rawText).html() + '</textarea>' +
            '<div class="dg-rsvp-edit-actions">' +
              '<button class="dg-rsvp-save-edit" data-comment-id="' + commentId + '">Simpan</button>' +
              '<button class="dg-rsvp-cancel-edit" data-comment-id="' + commentId + '">Batal</button>' +
            '</div>'
          );
          $textDiv.find('.dg-rsvp-edit-textarea').focus();
        }
      }
    });
  });

  // ---- Cancel Edit ----
  $(document).on('click', '.dg-rsvp-cancel-edit', function(e) {
    e.preventDefault();
    var commentId  = $(this).data('comment-id');
    var $textDiv   = $('#dg-rsvp-comment-' + commentId).find('.dg-rsvp-comment-text');
    $textDiv.removeClass('dg-rsvp-edit-mode').html($textDiv.data('original-html'));
  });

  // ---- Save Edit ----
  $(document).on('click', '.dg-rsvp-save-edit', function(e) {
    e.preventDefault();
    var $btn       = $(this);
    var commentId  = $btn.data('comment-id');
    var $textDiv   = $('#dg-rsvp-comment-' + commentId).find('.dg-rsvp-comment-text');
    var newText    = $textDiv.find('.dg-rsvp-edit-textarea').val().trim();

    if (!newText) return;

    $btn.prop('disabled', true).text('Menyimpan...');

    $.ajax({
      type: 'POST',
      url: DG_RSVP.ajaxurl,
      data: {
        action:          'dg_edit_rsvp_comment',
        nonce:           DG_RSVP.nonce,
        comment_id:      commentId,
        comment_content: newText,
        edit_key:        getModeratorKeyForWrapper($btn.closest('.dg-rsvp-wrapper'))
      },
      success: function(response) {
        if (response.success) {
          $textDiv.removeClass('dg-rsvp-edit-mode').html(response.data.html);
        } else {
          $btn.prop('disabled', false).text('Simpan');
          alert(response.data.message || 'Gagal menyimpan');
        }
      },
      error: function() {
        $btn.prop('disabled', false).text('Simpan');
        alert('Terjadi kesalahan. Silakan coba lagi.');
      }
    });
  });

  // ---- Delete Handler ----
  $(document).on('click', '.dg-rsvp-delete-link', function(e) {
    e.preventDefault();
    var commentId  = $(this).data('comment-id');
    var $li        = $('#dg-rsvp-item-comment-' + commentId);
    var $wrapper   = $(this).closest('.dg-rsvp-wrapper');

    var confirmMsg = (typeof DG_RSVP_WP !== 'undefined' && DG_RSVP_WP.textMsgDeleteComment)
                     ? DG_RSVP_WP.textMsgDeleteComment
                     : 'Hapus komentar ini?';
    if (!confirm(confirmMsg)) return;

    $.ajax({
      type: 'POST',
      url: DG_RSVP.ajaxurl,
      data: {
        action:     'dg_delete_rsvp_comment',
        nonce:      DG_RSVP.nonce,
        comment_id: commentId,
        edit_key:   getModeratorKeyForWrapper($wrapper)
      },
      success: function(response) {
        if (response.success) {
          // Update comment count in header link
          var $form = $wrapper.find('form[id^="commentform-"]');
          if ($form.length) {
            var postId = $form.attr('id').replace('commentform-', '');
            var $countLink = $('#dg-rsvp-link-' + postId);
            var linkText = $countLink.text();
            var numMatch = linkText.match(/(\d+)/);
            if (numMatch) {
              var num = Math.max(0, parseInt(numMatch[1], 10) - 1);
              $countLink.html(linkText.replace(/\d+/, num));
            }
          }
          // Fade out and remove the <li>
          $li.fadeOut(400, function() { $(this).remove(); });
        } else {
          alert(response.data.message || 'Gagal menghapus komentar');
        }
      },
      error: function() {
        alert('Terjadi kesalahan. Silakan coba lagi.');
      }
    });
  });

  // Nama field: hide / lock (pola floating alert seperti WDS jfb-lock-alert)
  var DG_RSVP_LOCK_ALERT_CLASS = 'dg-rsvp-lock-alert';
  var DG_RSVP_LOCK_ROW_CLASS = 'dg-rsvp-nama-locked-row';
  var DG_RSVP_LOCK_OVERLAY_CLASS = 'dg-rsvp-nama-lock-overlay';

  function getRsvpElementorId($wrapper) {
    const $el = $wrapper.closest('.elementor-element');
    if ($el.length && $el.data('id')) {
      return String($el.data('id'));
    }
    const cls = ($el.attr('class') || '').match(/elementor-element-([a-zA-Z0-9]+)/);
    return cls ? cls[1] : '';
  }

  function positionRsvpLockAlert(target, alertBox) {
    const rect = target.getBoundingClientRect();
    const alertRect = alertBox.getBoundingClientRect();
    let top = rect.top + window.scrollY - alertRect.height - 12;
    let left = rect.left + window.scrollX;

    if (left + alertRect.width > window.innerWidth - 20) {
      left = window.innerWidth - alertRect.width - 20;
    }
    if (left < 20) {
      left = 20;
    }
    if (top < window.scrollY + 20) {
      top = rect.bottom + window.scrollY + 12;
      alertBox.classList.add('is-below');
    } else {
      alertBox.classList.remove('is-below');
    }

    alertBox.style.left = left + 'px';
    alertBox.style.top = top + 'px';
  }

  function showRsvpLockAlert(target, message, elementId) {
    document.querySelectorAll('.' + DG_RSVP_LOCK_ALERT_CLASS).forEach(function(el) {
      el.remove();
    });

    const alertBox = document.createElement('div');
    alertBox.className = DG_RSVP_LOCK_ALERT_CLASS
      + (elementId ? (' ' + DG_RSVP_LOCK_ALERT_CLASS + '--' + elementId) : '');
    alertBox.setAttribute('role', 'status');
    alertBox.setAttribute('aria-live', 'polite');
    alertBox.textContent = message;
    document.body.appendChild(alertBox);

    positionRsvpLockAlert(target, alertBox);
    window.requestAnimationFrame(function() {
      positionRsvpLockAlert(target, alertBox);
    });

    window.setTimeout(function() {
      if (!alertBox.parentNode) {
        return;
      }
      alertBox.classList.add('is-leaving');
      window.setTimeout(function() {
        alertBox.remove();
      }, 280);
    }, 2200);
  }

  function initNamaField(form, wrapper) {
    if (!form.length || !wrapper.length || isOrganizerMode(wrapper)) {
      return;
    }

    const $author = form.find('#author');
    if (!$author.length || $author.data('dgNamaReady')) {
      return;
    }
    $author.data('dgNamaReady', true);

    if (wrapper.attr('data-show-name-field') === 'no') {
      $author.prop('required', false).removeAttr('required');
      return;
    }

    if (wrapper.attr('data-lock-nama') !== 'true') {
      return;
    }

    const message = wrapper.attr('data-lock-message')
      || 'Nama tidak dapat diubah. Ini adalah undangan khusus untuk Anda.';
    const elementId = getRsvpElementorId(wrapper);
    const $row = $author.closest('.dg-rsvp-field-wrap, .comment-form-author, .dg-digimo1-form-group');
    if (!$row.length) {
      return;
    }

    $row.addClass(DG_RSVP_LOCK_ROW_CLASS);
    $author
      .prop('readonly', true)
      .attr('readonly', 'readonly')
      .attr('tabindex', '-1')
      .addClass('dg-rsvp-nama-locked')
      .data('original-value', $author.val());

    let $overlay = $row.children('.' + DG_RSVP_LOCK_OVERLAY_CLASS);
    if (!$overlay.length) {
      $overlay = $('<div class="' + DG_RSVP_LOCK_OVERLAY_CLASS + '" aria-hidden="true"></div>');
      $row.append($overlay);
    }

    $overlay.off('.dgLockNama').on('click.dgLockNama mousedown.dgLockNama', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'click' && $author.val()) {
        showRsvpLockAlert($row[0], message, elementId);
      }
    });

    $author.off('.dgLockNama').on('keydown.dgLockNama input.dgLockNama paste.dgLockNama', function(e) {
      if (e.type === 'keydown') {
        const allowed = ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (allowed.indexOf(e.key) !== -1) {
          return;
        }
        if ((e.ctrlKey || e.metaKey) && ['a', 'c'].indexOf(String(e.key || '').toLowerCase()) !== -1) {
          return;
        }
      }
      e.preventDefault();
      const original = $(this).data('original-value');
      if (original !== undefined && original !== null) {
        $(this).val(original);
      }
      if ($(this).val()) {
        showRsvpLockAlert($row[0], message, elementId);
      }
    });
  }

  function updateAttendanceCounters() {
    const previewId = urlParams.get('preview_id');

    $('.dg-rsvp-link').each(function() {
      const link = $(this);
      const postId = link.attr('id').replace('dg-rsvp-link-', '');
      const widget = link.closest('.dg-rsvp-wrapper');
      const countWrap = widget.find('.dg-rsvp_comment_count_card_wrap');

      if (!countWrap.length) return;

      const card1 = countWrap.find('.dg-rsvp_card-acara-1');
      const card2 = countWrap.find('.dg-rsvp_card-acara-2');
      const card3 = countWrap.find('.dg-rsvp_card-acara-3');

      $.ajax({
        url: DG_RSVP_WP.ajaxurl,
        method: 'POST',
        data: {
          action: 'dg_rsvp_get_updated_counts',
          post_id: postId,
          preview_id: previewId || '',
          nonce: DG_RSVP_WP.nonce
        },
        success: function(response) {
          if (response.success && response.data) {
            const counts = response.data;

            if (card1.length) {
              const name1 = card1.attr('data-acara-name');
              card1.find('span:first').text(name1 && counts[name1] !== undefined ? counts[name1] : 0);
            }
            if (card2.length) {
              const name2 = card2.attr('data-acara-name');
              card2.find('span:first').text(name2 && counts[name2] !== undefined ? counts[name2] : 0);
            }
            if (card3.length) {
              const name3 = card3.attr('data-acara-name');
              card3.find('span:first').text(name3 && counts[name3] !== undefined ? counts[name3] : 0);
            }

            countWrap.find('.dg-rsvp_card-tidak_hadir span:first').text(counts.tidak_hadir || 0);
            countWrap.find('.dg-rsvp_card-masih_ragu span:first').text(counts.masih_ragu || 0);
          }
        }
      });
    });
  }

  $('.dg-rsvp-wrapper').each(function() {
    const wrapper = $(this);
    const form = wrapper.find('form[id^="commentform-"]');
    if (!form.length || isOrganizerMode(wrapper)) {
      return;
    }
    initNamaField(form, wrapper);
  });

  $(window).on('elementor/frontend/init', function() {
    if (typeof elementorFrontend === 'undefined' || !elementorFrontend.hooks) {
      return;
    }
    elementorFrontend.hooks.addAction('frontend/element_ready/dg-smart-rsvp.default', function($scope) {
      $scope.find('.dg-rsvp-wrapper').each(function() {
        const wrapper = $(this);
        const form = wrapper.find('form[id^="commentform-"]');
        if (!form.length || isOrganizerMode(wrapper)) {
          return;
        }
        form.find('#author').removeData('dgNamaReady');
        initNamaField(form, wrapper);
      });
    });
  });

  setTimeout(updateAttendanceCounters, 500);

});
