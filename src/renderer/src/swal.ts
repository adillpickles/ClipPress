import SwalRaw from 'sweetalert2/dist/sweetalert2.js';
import type { SweetAlertOptions } from 'sweetalert2';
import type { ReactSweetAlert, SweetAlert2 } from 'sweetalert2-react-content';
import withReactContent from 'sweetalert2-react-content';

import i18n from './i18n';
import { emitter as animationsEmitter } from './animations';
import { dialogButtonOrder } from './util';

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
    reverseButtons: dialogButtonOrder === 'ltr',
  };

  Swal = SwalRaw.mixin({
    ...commonSwalOptions,
  });

  toast = Swal.mixin({
    ...commonSwalOptions,
    toast: true,
    width: '24rem',
    position: 'top-end',
    showConfirmButton: false,
    showCloseButton: true,
    timer: 3200,
    timerProgressBar: false,
    showClass: {
      popup: 'swal2-noanimation',
      backdrop: '',
      icon: '',
    },
    hideClass: {
      popup: 'swal2-noanimation',
      backdrop: '',
      icon: '',
    },
    customClass: {
      popup: 'clippress-toast',
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

export const errorToast = (text: string) => toast.fire({
  icon: 'error',
  text,
});

export const showPlaybackFailedMessage = () => errorToast(i18n.t('Unable to playback this file. Try to convert to supported format from the menu'));
