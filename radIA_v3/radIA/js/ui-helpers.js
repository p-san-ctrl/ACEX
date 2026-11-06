
/* =========================================================
   VALIDAÇÃO DA LGPD
========================================================= */

function validatePatientLGPD() {

  const userType =
    document.getElementById('user-type').value;

  /*
    Radiologista não precisa marcar o termo
    nesta tela.
  */

  if (userType !== 'paciente') {
    return true;
  }

  // O administrador pode acessar a versão de paciente sem precisar
  // aceitar o termo como se fosse um paciente real.
  const cpfOuEmail = document.getElementById('cpf-input')?.value.trim() || '';
  if (cpfOuEmail.includes('@')) {
    return true;
  }


  const checkbox =
    document.getElementById('patient-lgpd-checkbox');

  const error =
    document.getElementById('lgpd-error');


  if (!checkbox.checked) {

    error.classList.remove('hidden');

    checkbox.focus();


    if (typeof showToast === 'function') {

      showToast(
        'Aceite os termos de consentimento e privacidade para continuar.'
      );

    } else {

      alert(
        'Aceite os termos de consentimento e privacidade para continuar.'
      );

    }

    return false;
  }


  error.classList.add('hidden');


  /*
    Registro de demonstração.

    Em produção, esse registro deve ser enviado
    e armazenado no servidor.
  */

  const consentRecord = {

    termVersion: 'LGPD-2026.08',

    acceptedAt:
      new Date().toISOString(),

    userType: 'paciente',

    consent: true

  };


  console.log(
    'Consentimento LGPD registrado:',
    consentRecord
  );


  return true;

}



/* =========================================================
   TROCA ENTRE PACIENTE E RADIOLOGISTA
========================================================= */

const originalToggleLoginFields =
  window.toggleLoginFields;


/*
  Se seu script.js já possuir essa função,
  ela será preservada e executada primeiro.
*/

window.toggleLoginFields = function() {


  /*
    Executa a função original, se existir.
  */

  if (
    typeof originalToggleLoginFields === 'function'
  ) {

    originalToggleLoginFields.apply(
      this,
      arguments
    );

  }


  const userType =
    document.getElementById('user-type').value;


  const professionalLogin =
    document.getElementById('professional-login');


  const patientLogin =
    document.getElementById('patient-login');


  const checkbox =
    document.getElementById('patient-lgpd-checkbox');


  const error =
    document.getElementById('lgpd-error');


  /*
    PACIENTE
  */

  if (userType === 'paciente') {

    professionalLogin.classList.add(
      'hidden'
    );

    patientLogin.classList.remove(
      'hidden'
    );

    return;

  }


  /*
    RADIOLOGISTA
  */

  professionalLogin.classList.remove(
    'hidden'
  );

  patientLogin.classList.add(
    'hidden'
  );


  /*
    Ao trocar para radiologista,
    limpa o aceite do paciente.
  */

  if (checkbox) {
    checkbox.checked = false;
  }


  if (error) {
    error.classList.add('hidden');
  }

};



/* =========================================================
   MODAL DE DETALHES DO EXAME
========================================================= */

window.openModal = function() {

  const modal =
    document.getElementById('modal-view');


  if (!modal) {
    return;
  }


  modal.classList.remove(
    'hidden'
  );


  modal.classList.add(
    'flex'
  );

};



window.closeModal = function() {

  const modal =
    document.getElementById('modal-view');


  if (!modal) {
    return;
  }


  modal.classList.add(
    'hidden'
  );


  modal.classList.remove(
    'flex'
  );

};



/* =========================================================
   MODAL LGPD
========================================================= */

window.openConsentDetails = function() {

  const modal =
    document.getElementById('consent-modal');


  if (!modal) {
    return;
  }


  modal.classList.remove(
    'hidden'
  );


  modal.classList.add(
    'flex'
  );

};



window.closeConsentDetails = function() {

  const modal =
    document.getElementById('consent-modal');


  if (!modal) {
    return;
  }


  modal.classList.add(
    'hidden'
  );


  modal.classList.remove(
    'flex'
  );

};



/* =========================================================
   FECHAR MODAL DE EXAME CLICANDO FORA
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  function() {


    /* =========================================
       Inicialização correta do login
    ========================================= */

    const userType =
      document.getElementById('user-type');


    if (userType) {

      /*
        Garante que o formulário comece
        mostrando o paciente.
      */

      document
        .getElementById('professional-login')
        .classList.add('hidden');


      document
        .getElementById('patient-login')
        .classList.remove('hidden');

    }


    /* =========================================
       Checkbox LGPD
    ========================================= */

    const checkbox =
      document.getElementById(
        'patient-lgpd-checkbox'
      );


    if (checkbox) {

      checkbox.addEventListener(
        'change',
        function() {

          const error =
            document.getElementById(
              'lgpd-error'
            );


          if (this.checked) {

            error.classList.add(
              'hidden'
            );

          }

        }
      );

    }


    /* =========================================
       Modal de exame
    ========================================= */

    const examModal =
      document.getElementById(
        'modal-view'
      );


    if (examModal) {

      examModal.addEventListener(
        'click',
        function(event) {

          /*
            Só fecha quando clicar no fundo escuro.
            Clicar dentro da janela não fecha.
          */

          if (
            event.target === examModal
          ) {

            closeModal();

          }

        }
      );

    }


    /* =========================================
       Modal LGPD
    ========================================= */

    const consentModal =
      document.getElementById(
        'consent-modal'
      );


    if (consentModal) {

      consentModal.addEventListener(
        'click',
        function(event) {

          /*
            Fecha ao clicar no fundo escuro.
          */

          if (
            event.target === consentModal
          ) {

            closeConsentDetails();

          }

        }
      );

    }


  }
);


/* =========================================================
   ESC FECHA OS MODAIS
========================================================= */

document.addEventListener(
  'keydown',
  function(event) {

    if (event.key !== 'Escape') {
      return;
    }


    closeModal();

    closeConsentDetails();

  }
);
