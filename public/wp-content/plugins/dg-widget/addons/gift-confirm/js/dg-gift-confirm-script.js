(function($) {
  'use strict';

  // Wait for jQuery and DOM to be ready
  $(function() {
    // Initialize DG_GIFT_CONFIRM with fallback values
    const DG_GIFT_CONFIRM = {
      ajaxurl: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.ajaxurl) ? DG_GIFT_CONFIRM_WP.ajaxurl : '/wp-admin/admin-ajax.php',
      nonce: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.nonce) ? DG_GIFT_CONFIRM_WP.nonce : '',
      thanks: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.thanks) ? DG_GIFT_CONFIRM_WP.thanks : 'Terima kasih atas konfirmasi Anda!',
      errorNama: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.errorNama) ? DG_GIFT_CONFIRM_WP.errorNama : 'Nama tidak ditemukan',
      errorKonfirmasi: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.errorKonfirmasi) ? DG_GIFT_CONFIRM_WP.errorKonfirmasi : 'Silakan pilih jenis konfirmasi',
      errorBank: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.errorBank) ? DG_GIFT_CONFIRM_WP.errorBank : 'Silakan pilih bank',
      errorJumlah: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.errorJumlah) ? DG_GIFT_CONFIRM_WP.errorJumlah : 'Silakan isi jumlah transfer',
      errorHadiah: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.errorHadiah) ? DG_GIFT_CONFIRM_WP.errorHadiah : 'Silakan isi nama hadiah',
      locales: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.locales) ? DG_GIFT_CONFIRM_WP.locales : {},
      defaultLocale: (typeof DG_GIFT_CONFIRM_WP !== 'undefined' && DG_GIFT_CONFIRM_WP.defaultLocale) ? DG_GIFT_CONFIRM_WP.defaultLocale : 'id',
    };

    // URL & guest verification helpers
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');
    const legacyNama = urlParams.get('to') || urlParams.get('dear') || urlParams.get('kepada');
    const NAME_DB_REJECT_FALLBACK = 'Konfirmasi hanya untuk tamu undangan';
    const NAME_DB_CACHE = {};

    function normalizeGiftLocale(locale) {
      const raw = String(locale || '').toLowerCase().trim();
      const map = {
        id: 'id',
        indonesia: 'id',
        in: 'id',
        en: 'en',
        english: 'en',
        ms: 'ms',
        malaysia: 'ms',
        ms_my: 'ms'
      };
      return map[raw] || DG_GIFT_CONFIRM.defaultLocale || 'id';
    }

    function getWrapperLocale($wrapper) {
      if (!$wrapper || !$wrapper.length) {
        return normalizeGiftLocale(DG_GIFT_CONFIRM.defaultLocale);
      }
      return normalizeGiftLocale($wrapper.attr('data-gift-locale') || DG_GIFT_CONFIRM.defaultLocale);
    }

    function dgGiftT(key, locale, fallback) {
      const loc = normalizeGiftLocale(locale);
      const packs = DG_GIFT_CONFIRM.locales || {};
      if (packs[loc] && packs[loc][key]) {
        return packs[loc][key];
      }
      if (packs.id && packs.id[key]) {
        return packs.id[key];
      }
      return fallback || '';
    }

    function getSlugFromPath() {
      const pathParts = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
      return pathParts[pathParts.length - 1] || '';
    }

    function isOrganizerMode(wrapper) {
      const paramName = wrapper.attr('data-organizer-param-key') || 'admin';
      const providedKey = urlParams.get(paramName) || '';
      return wrapper.attr('data-is-organizer') === 'yes' && !!providedKey;
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
          url: DG_GIFT_CONFIRM.ajaxurl,
          dataType: 'json',
          data: {
            action: 'dg_verify_guest_name',
            nonce: DG_GIFT_CONFIRM.nonce,
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

    function initializeGiftNameMode() {
      $('.dg-gift-confirm-wrapper').each(function() {
        const wrapper = $(this);
        const form = wrapper.find('form.dg-gift-confirm-form');
        if (!form.length) return;

        const useNameDatabase = wrapper.attr('data-use-name-database') === 'yes';
        const rejectMessage = wrapper.attr('data-name-db-reject-message') || NAME_DB_REJECT_FALLBACK;

        if (source) {
          form.find('#dg_gift_source').val(source);
        }

        if (!useNameDatabase) {
          if (legacyNama) {
            form.find('#dg_gift_nama').val(legacyNama);
          }
          form.data('dgNameDbValid', true);
          return;
        }

        if (isOrganizerMode(wrapper) && !source) {
          form.find('#dg_gift_nama').val('admin');
          form.data('dgNameDbValid', true);
          return;
        }

        verifyGuestName().then(function(result) {
          if (result.valid && result.name) {
            form.find('#dg_gift_nama').val(result.name);
            form.data('dgNameDbValid', true);
          } else {
            form.find('#dg_gift_nama').val('');
            form.data('dgNameDbValid', false);
            form.data('dgNameDbRejectMessage', rejectMessage || result.message || NAME_DB_REJECT_FALLBACK);
          }
        });
      });
    }

    initializeGiftNameMode();

    // Number formatting with dot (.) as thousand separator
    function formatNumber(num) {
      if (!num) return '';
      // Remove all non-numeric characters
      const cleanNum = num.toString().replace(/[^\d]/g, '');
      // Add thousand separators using dot (.)
      return cleanNum.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function unformatNumber(str) {
      if (!str) return '';
      // Remove dot separator and keep only digits
      return str.replace(/\./g, '');
    }

    // Apply number formatting to jumlah transfer field with dot separator
    $(document).on('input', '.dg-gift-confirm-number-format', function () {
      const cursorPos = this.selectionStart;
      const oldLength = this.value.length;
      const rawValue = unformatNumber(this.value);
      const formattedValue = formatNumber(rawValue);

      this.value = formattedValue;

      // Store raw value in hidden field
      $(this).siblings('#dg_gift_jumlah_transfer_raw').val(rawValue);

      // Adjust cursor position
      const newLength = formattedValue.length;
      const diff = newLength - oldLength;
      this.setSelectionRange(cursorPos + diff, cursorPos + diff);
    });

    // Prevent non-numeric input - allow digits only (dot separator added automatically)
    $(document).on('keypress', '.dg-gift-confirm-number-format', function (e) {
      // Allow: backspace, delete, tab, escape, enter
      if ($.inArray(e.keyCode, [46, 8, 9, 27, 13]) !== -1 ||
        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey === true) ||
        (e.keyCode === 67 && e.ctrlKey === true) ||
        (e.keyCode === 86 && e.ctrlKey === true) ||
        (e.keyCode === 88 && e.ctrlKey === true) ||
        // Allow: home, end, left, right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
        return;
      }
      // Only allow numeric keys (0-9) - dot separator will be added automatically by formatNumber
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault();
      }
    });

    // Conditional display based on konfirmasi type
    $(document).on('change', '#dg_gift_konfirmasi_type', function () {
      const konfirmasiType = $(this).val();
      const form = $(this).closest('form');
      const transferFields = form.find('.dg-gift-confirm-transfer-field');
      const parcelFields = form.find('.dg-gift-confirm-parcel-field');

      // Hide all conditional fields first
      transferFields.slideUp(200);
      parcelFields.slideUp(200);

      // Remove required attributes
      form.find('#dg_gift_bank').removeAttr('required');
      form.find('#dg_gift_jumlah_transfer').removeAttr('required');
      form.find('#dg_gift_hadiah').removeAttr('required');

      if (konfirmasiType === 'transfer') {
        // Show transfer fields only
        transferFields.slideDown(200);
        form.find('#dg_gift_bank').attr('required', 'required');
        form.find('#dg_gift_jumlah_transfer').attr('required', 'required');
      } else if (konfirmasiType === 'parcel') {
        // Show parcel fields only
        parcelFields.slideDown(200);
        form.find('#dg_gift_hadiah').attr('required', 'required');
      } else if (konfirmasiType === 'transfer_parcel') {
        // Show all fields
        transferFields.slideDown(200);
        parcelFields.slideDown(200);
        form.find('#dg_gift_bank').attr('required', 'required');
        form.find('#dg_gift_jumlah_transfer').attr('required', 'required');
        form.find('#dg_gift_hadiah').attr('required', 'required');
      }
    });

    // Form submission - Use event delegation for dynamic forms
    // Bind to both form submit and button click as fallback
    $(document).on('submit', '.dg-gift-confirm-form', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handleFormSubmit($(this));
      return false;
    });
    
    // Also bind to button click as fallback - more general selector
    $(document).on('click', '.dg-gift-confirm-submit, button[type="submit"]', function (event) {
      // Check if this button is inside a gift confirm form
      const form = $(this).closest('.dg-gift-confirm-form');
      if (form.length) {
        event.preventDefault();
        event.stopPropagation();
        // Trigger submit event which will be caught by the submit handler above
        form.trigger('submit');
      }
    });
    
    // Main form submission handler
    function handleFormSubmit(formElement) {
      const form = $(formElement);
      const postId = form.find('#dg_gift_post_id').val();
      const widgetWrapper = form.closest('.dg-gift-confirm-wrapper');
      const locale = getWrapperLocale(widgetWrapper);
      
      if (!postId) {
        alert(dgGiftT('alert_form_id_missing', locale, 'Error: Form ID tidak ditemukan. Silakan refresh halaman.'));
        return false;
      }

      const status = $('#dg-gift-confirm-status-' + postId);
      const submitBtn = form.find('.dg-gift-confirm-submit, button[type="submit"]');

      if (!submitBtn.length) {
        alert(dgGiftT('alert_submit_missing', locale, 'Error: Tombol submit tidak ditemukan.'));
        return false;
      }

      // Disable submit button
      submitBtn.prop('disabled', true);

      // Get form data
      const nama = form.find('#dg_gift_nama').val().trim();
      const konfirmasiType = form.find('#dg_gift_konfirmasi_type').val();
      const bank = form.find('#dg_gift_bank').val();
      const jumlahTransferRaw = form.find('#dg_gift_jumlah_transfer_raw').val() || unformatNumber(form.find('#dg_gift_jumlah_transfer').val());
      const jumlahTransferFormatted = form.find('#dg_gift_jumlah_transfer').val();
      const hadiah = form.find('#dg_gift_hadiah').val().trim();
      const catatan = form.find('#dg_gift_catatan').val().trim();
      const formName = form.find('#dg_gift_form_name').val();
      const source = form.find('#dg_gift_source').val();
      const useNameDatabase = widgetWrapper.attr('data-use-name-database') === 'yes';
      const organizerMode = isOrganizerMode(widgetWrapper);

      // Validation
      if (useNameDatabase && !organizerMode) {
        const rejectMsg = widgetWrapper.attr('data-name-db-reject-message') || form.data('dgNameDbRejectMessage') || dgGiftT('name_db_reject_message', locale, NAME_DB_REJECT_FALLBACK);
        const isValidGuest = !!form.data('dgNameDbValid');
        if (!isValidGuest) {
          alert(rejectMsg);
          submitBtn.prop('disabled', false);
          return false;
        }
      }

      if (useNameDatabase && organizerMode && !source && !nama) {
        form.find('#dg_gift_nama').val('admin');
      }

      const namaFinal = form.find('#dg_gift_nama').val().trim();

      if (!namaFinal) {
        alert(dgGiftT('alert_error_nama', locale, DG_GIFT_CONFIRM.errorNama));
        submitBtn.prop('disabled', false);
        return false;
      }

      if (!konfirmasiType) {
        alert(dgGiftT('alert_error_konfirmasi', locale, DG_GIFT_CONFIRM.errorKonfirmasi));
        submitBtn.prop('disabled', false);
        return false;
      }

      // Validate based on konfirmasi type
      if (konfirmasiType === 'transfer' || konfirmasiType === 'transfer_parcel') {
        if (!bank) {
          alert(dgGiftT('alert_error_bank', locale, DG_GIFT_CONFIRM.errorBank));
          submitBtn.prop('disabled', false);
          return false;
        }
        if (!jumlahTransferRaw) {
          alert(dgGiftT('alert_error_jumlah', locale, DG_GIFT_CONFIRM.errorJumlah));
          submitBtn.prop('disabled', false);
          return false;
        }
      }

      if (konfirmasiType === 'parcel' || konfirmasiType === 'transfer_parcel') {
        if (!hadiah) {
          alert(dgGiftT('alert_error_hadiah', locale, DG_GIFT_CONFIRM.errorHadiah));
          submitBtn.prop('disabled', false);
          return false;
        }
      }

      // Get dg_idform value
      const dgIdform = form.find('#dg_idform').val() || '1';

      // Prepare form data object
      const formData = {
        nama: namaFinal,
        konfirmasi_type: konfirmasiType,
        bank: bank || '',
        jumlah_transfer: jumlahTransferFormatted || '',
        jumlah_transfer_raw: jumlahTransferRaw || '',
        hadiah: hadiah || '',
        catatan: catatan || '',
        form_name: formName,
        source: source,
        dg_idform: dgIdform
      };

      // Show loading
      if (status.length) {
        status.addClass('dg-gift-confirm-loading').html('<span class="dg-gift-confirm-spinner"></span>').show();
      }

      const successMsg = widgetWrapper.attr('data-gift-msg-success')
        || dgGiftT('msg_success', locale, 'Terima kasih sudah melakukan konfirmasi');
      const errorMsg = widgetWrapper.attr('data-gift-msg-error')
        || dgGiftT('msg_error', locale, 'Konfirmasi gagal dikirimkan');

      // Execute redirects/actions
      executeActions(postId, formData, form).then(function() {
        // Hide form
        const formWrap = form.closest('.dg-gift-confirm-wrap-form');
        if (formWrap.length) {
          formWrap.slideUp(300);
        }
        
        // Show success message with green styling
        if (status.length) {
          status.removeClass('dg-gift-confirm-loading')
                .addClass('dg-gift-confirm-message-success')
                .html('<p class="dg-gift-confirm-success">' + successMsg + '</p>')
                .show();
        } else {
          // Fallback: show alert if status element not found
          alert(successMsg);
        }

        // Re-enable submit (in case of error)
        submitBtn.prop('disabled', false);

      }).catch(function(error) {
        // Hide form even on error
        const formWrap = form.closest('.dg-gift-confirm-wrap-form');
        if (formWrap.length) {
          formWrap.slideUp(300);
        }
        
        // Show error message with red styling
        if (status.length) {
          status.removeClass('dg-gift-confirm-loading')
                .addClass('dg-gift-confirm-message-error')
                .html('<p class="dg-gift-confirm-error">' + errorMsg + '</p>')
                .show();
        } else {
          // Fallback: show alert if status element not found
          alert(errorMsg);
        }

        submitBtn.prop('disabled', false);
      });
    }
    // End handleFormSubmit function

    // Simpan sheet_url & api_url ke server (post meta) saat load - agar tidak ikut di payload submit
    function saveWidgetConfigOnce() {
      $('.dg-gift-confirm-wrapper').each(function() {
        const wrapper = $(this);
        const sheetUrl = wrapper.attr('data-sheet-url') || '';
        const apiUrl = wrapper.attr('data-guestbook-api') || '';
        const form = wrapper.find('form.dg-gift-confirm-form');
        if (!form.length) return;
        const postId = form.find('#dg_gift_post_id').val();
        const form_name = form.find('input[name="dg_gift_form_name"]').val() || '';
        if (!postId || !form_name) return;
        if (!sheetUrl && !apiUrl) return;

        jQuery.ajax({
          type: 'POST',
          url: DG_GIFT_CONFIRM.ajaxurl,
          data: {
            action: 'dg_gift_confirm_save_widget_config',
            nonce: DG_GIFT_CONFIRM.nonce,
            post_id: postId,
            form_name: form_name,
            sheet_url: sheetUrl,
            api_url: apiUrl
          }
        });
      });
    }

    // Execute Actions (WhatsApp, Google Sheet, Guestbook)
    function executeActions(postId, formData, form) {
      return new Promise(function(resolve, reject) {
        const widgetWrapper = form.closest('.dg-gift-confirm-wrapper');

        if (!widgetWrapper.length) {
          reject(new Error('Widget wrapper tidak ditemukan'));
          return;
        }

        const form_name = formData.form_name || '';
        const actions = [];

        // WhatsApp Action
        const enableWa = widgetWrapper.attr('data-enable-wa');
        if (enableWa === 'yes') {
          const waNumber = window.DG_GIFT_CONFIRM_WA_NUMBER || widgetWrapper.attr('data-wa-number');

          let waTemplate = '';
          if (formData.konfirmasi_type === 'transfer') {
            waTemplate = widgetWrapper.attr('data-wa-template-transfer');
          } else if (formData.konfirmasi_type === 'parcel') {
            waTemplate = widgetWrapper.attr('data-wa-template-parcel');
          } else if (formData.konfirmasi_type === 'transfer_parcel') {
            waTemplate = widgetWrapper.attr('data-wa-template-both');
          }

          if (waNumber && waTemplate) {
            actions.push(() => sendToWhatsApp(waNumber, waTemplate, formData, form));
          }
        }

        // Google Sheet - URL diambil server dari post meta, tidak dikirim di payload
        const enableSheet = widgetWrapper.attr('data-enable-sheet');
        if (enableSheet === 'yes' || enableSheet === 'true') {
          actions.push(function() {
            return sendToGoogleSheet(postId, form_name, formData);
          });
        }

        // Guestbook API - URL diambil server dari post meta, tidak dikirim di payload
        const enableGuestbook = widgetWrapper.attr('data-enable-guestbook');
        if (enableGuestbook === 'yes') {
          const guestbookApi = widgetWrapper.attr('data-guestbook-api');
          if (guestbookApi) {
            actions.push(() => sendToGuestbook(postId, form_name, formData));
          }
        }

        if (actions.length > 0) {
          Promise.allSettled(actions.map(fn => {
            try {
              return fn();
            } catch (error) {
              return Promise.reject(error);
            }
          }))
            .then(function(results) {
              const failures = results.filter(result => result.status === 'rejected');
              if (failures.length > 0 && failures.length >= Math.ceil(actions.length / 2)) {
                const errorMessages = failures.map(f => f.reason ? f.reason.message : 'Unknown error').join(', ');
                reject(new Error('Konfirmasi gagal dikirimkan: ' + errorMessages));
              } else {
                resolve();
              }
            })
            .catch(function(error) {
              reject(error);
            });
        } else {
          sendToGoogleSheet(postId, form_name, formData)
            .then(function() {
              resolve();
            })
            .catch(function(error) {
              reject(new Error('Tidak ada action yang diaktifkan. Silakan aktifkan minimal Google Sheet di pengaturan widget.'));
            });
        }
      });
    }

    // Helper: Normalize phone number
    function normalizePhoneNumber(phone) {
      let clean = phone.replace(/[^\d]/g, '');

      if (clean.startsWith('08')) {
        clean = '62' + clean.slice(1);
      } else if (clean.startsWith('8') && !clean.startsWith('62')) {
        clean = '62' + clean;
      } else if (!clean.startsWith('62')) {
        clean = '62' + clean;
      }

      return clean;
    }

    // Helper: Parse template with placeholders
    function parseTemplate(template, data, form) {
      let result = template;

      const dynamicTags = {
        '{nama}': data.nama || '',
        '{konfirmasi_type}': getKonfirmasiTypeLabel(data.konfirmasi_type, form) || '',
        '{bank}': data.bank || '',
        '{jumlah_transfer}': data.jumlah_transfer || '',
        '{hadiah}': data.hadiah || '',
        '{catatan}': data.catatan || '',
        '{form_name}': data.form_name || '',
        '{source}': data.source || '',
        '{date}': new Date().toLocaleDateString('id-ID'),
        '{time}': new Date().toLocaleTimeString('id-ID'),
        '{site_name}': window.location.hostname,
        '{site_url}': window.location.origin,
      };

      // Replace dynamic tags
      Object.keys(dynamicTags).forEach(tag => {
        const value = dynamicTags[tag];
        const isEmpty = value === null || value === undefined ||
          (typeof value === 'string' && value.trim() === '') ||
          value === '';
        const replacement = isEmpty ? '-' : String(value);
        result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), replacement);
      });

      return result;
    }

    // Helper: Get konfirmasi type label from dropdown (literal), fallback ke map lama
    function getKonfirmasiTypeLabel(type, form) {
      if (form && form.length && type) {
        const labelFromOption = form.find('#dg_gift_konfirmasi_type option[value="' + type + '"]').first().text();
        if (labelFromOption && String(labelFromOption).trim()) {
          return String(labelFromOption).trim();
        }
      }
      const labels = {
        'transfer': 'Transfer Gift',
        'parcel': 'Parcel Gift',
        'transfer_parcel': 'Transfer & Parcel'
      };
      return labels[type] || type;
    }

    // Send to WhatsApp
    function sendToWhatsApp(waNumber, template, formData, form) {
      return new Promise((resolve, reject) => {
        try {
          const message = parseTemplate(template, formData, form);
          const normalizedPhone = normalizePhoneNumber(waNumber);
          const url = `https://api.whatsapp.com/send/?phone=${normalizedPhone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;

          window.open(url, '_blank');
          resolve('whatsapp');
        } catch (error) {
          reject(error);
        }
      });
    }

    // Send to Google Sheet (sheet_url diambil server dari post meta - tidak dikirim di payload)
    function sendToGoogleSheet(postId, form_name, formData) {
      return new Promise((resolve, reject) => {
        try {
          if (!formData || !formData.nama) {
            reject(new Error('Missing required form data'));
            return;
          }
          if (!DG_GIFT_CONFIRM || !DG_GIFT_CONFIRM.ajaxurl) {
            reject(new Error('AJAX URL not configured'));
            return;
          }

          const payload = {
            action: 'dg_gift_confirm_send_to_sheet',
            nonce: DG_GIFT_CONFIRM.nonce || '',
            post_id: postId,
            form_name: form_name,
            dg_idform: formData.dg_idform || '1',
            nama: formData.nama || '',
            konfirmasi_type: formData.konfirmasi_type || '',
            bank: formData.bank || '',
            jumlah_transfer: formData.jumlah_transfer || '',
            hadiah: formData.hadiah || '',
            catatan: formData.catatan || ''
          };

          jQuery.ajax({
            type: 'POST',
            url: DG_GIFT_CONFIRM.ajaxurl,
            data: payload,
            timeout: 30000,
            dataType: 'json',
            success: function (response) {
              resolve('sheet');
            },
            error: function (xhr, textStatus, errorThrown) {
              reject(new Error('Sheet request failed: ' + errorThrown));
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    // Send to Guestbook API (api_url diambil server dari post meta - tidak dikirim di payload)
    function sendToGuestbook(postId, form_name, formData) {
      return new Promise((resolve, reject) => {
        const payload = {
          action: 'dg_gift_confirm_send_to_guestbook',
          nonce: DG_GIFT_CONFIRM.nonce,
          post_id: postId,
          form_name: form_name,
          gift_confirm_id: formData.source || '',
          nama: formData.nama || '',
          konfirmasi_type: formData.konfirmasi_type || '',
          bank: formData.bank || '',
          jumlah_transfer: formData.jumlah_transfer || '',
          hadiah: formData.hadiah || '',
          catatan: formData.catatan || '',
          timestamp: new Date().toISOString()
        };

        jQuery.ajax({
          type: 'POST',
          url: DG_GIFT_CONFIRM.ajaxurl,
          data: payload,
          timeout: 10000,
          success: function (response) {
            resolve('guestbook');
          },
          error: function (xhr, status, error) {
            reject(new Error('Guestbook request failed: ' + error));
          }
        });
      });
    }

    // Simpan config (sheet_url, api_url) ke server saat halaman load
    saveWidgetConfigOnce();

  }); // End jQuery ready
})(jQuery);
