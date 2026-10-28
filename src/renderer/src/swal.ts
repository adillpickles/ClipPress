import SwalRaw from 'sweetalert2/dist/sweetalert2.js';
import type { SweetAlertOptions } from 'sweetalert2';
import type { ReactSweetAlert, SweetAlert2 } from 'sweetalert2-react-content';
import withReactContent from 'sweetalert2-react-content';

import i18n from './i18n';
import { emitter as animationsEmitter } from './animations';

export const swalContainerWrapperId = 'swal2-container-wrapper';

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
  };

  Swal = SwalRaw.mixin({
    ...commonSwalOptions,
  });

  toast = Swal.mixin({
    ...commonSwalOptions,
    toast: true,
    width: '20rem',
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
