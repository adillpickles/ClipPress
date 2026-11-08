import SwalRaw from 'sweetalert2/dist/sweetalert2.js';
import type { SweetAlertOptions } from 'sweetalert2';
import type { ReactSweetAlert, SweetAlert2 } from 'sweetalert2-react-content';
import withReactContent from 'sweetalert2-react-content';

import i18n from './i18n';
import { emitter as animationsEmitter } from './animations';

export const swalContainerWrapperId = 'swal2-container-wrapper';

// react-icons' FiX, as markup: SweetAlert takes the close button's content as HTML.
const closeIconSvg = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

let Swal: SweetAlert2;
let toast: SweetAlert2;
let ReactSwal: SweetAlert2 & ReactSweetAlert;

function initSwal(reducedMotion = false) {
  const commonSwalOptions: SweetAlertOptions = {
    target: `#${swalContainerWrapperId}`,
    ...(reducedMotion && {
      showClass: {
        popup: '',
        backdrop: '',
        icon: '',
      },
      hideClass: {
        popup: '',
        backdrop: '',
        icon: '',
      },
    }),
    // The main button rightmost, as in the app's own dialogs (Dialog.ButtonRow).
    reverseButtons: true,
    // The app's own X (CloseButton.tsx), not a text "×" (sized in swal2.scss).
    closeButtonHtml: closeIconSvg,
    closeButtonAriaLabel: i18n.t('Close'),
  };

  Swal = SwalRaw.mixin({
    ...commonSwalOptions,
  });

  toast = Swal.mixin({
    ...commonSwalOptions,
    toast: true,
    // Sized to the text, up to the stylesheet's max-width (two or three lines for most messages).
    width: 'auto',
    position: 'bottom-end',
    showConfirmButton: false,
    showCloseButton: true,
    timer: 2000,
    timerProgressBar: false,
    returnFocus: false,
    showClass: reducedMotion
      ? {
        popup: '',
        backdrop: '',
        icon: '',
      }
      : {
        popup: 'clippress-toast-show',
        backdrop: '',
        icon: '',
      },
    hideClass: reducedMotion
      ? {
        popup: '',
        backdrop: '',
        icon: '',
      }
      : {
        popup: 'clippress-toast-hide',
        backdrop: '',
        icon: '',
      },
    customClass: {
      popup: 'clippress-toast',
    },
    didOpen: (popup) => {
      popup.addEventListener('mouseenter', Swal.stopTimer);
      popup.addEventListener('mouseleave', Swal.resumeTimer);
    },
  });

  ReactSwal = withReactContent(Swal);
}

animationsEmitter.on('reducedMotion', (reducedMotion) => initSwal(reducedMotion));

initSwal();

export default function getSwal() {
  return {
    Swal,
    ReactSwal,
    toast,
  };
}

// Long enough to read what went wrong: about 60 ms a letter, 2 to 8 s.
export const errorToast = (text: string) => toast.fire({
  icon: 'error',
  text,
  timer: Math.min(8000, Math.max(2000, text.length * 60)),
});

export const showPlaybackFailedMessage = () => errorToast(i18n.t('Unable to playback this file. Try to convert to supported format from the menu'));
