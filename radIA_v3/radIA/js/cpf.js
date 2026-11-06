(function cpfModule() {
  'use strict';

  const ERROR_CLASSES = ['border-red-500', 'ring-2', 'ring-red-200'];

  function digits(value = '') {
    return String(value).replace(/\D/g, '').slice(0, 11);
  }

  function format(value = '') {
    return digits(value)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function isValid(value = '') {
    const cpf = digits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

    for (let position = 9; position <= 10; position += 1) {
      let sum = 0;
      for (let index = 0; index < position; index += 1) {
        sum += Number(cpf[index]) * (position + 1 - index);
      }
      const remainder = (sum * 10) % 11;
      const checkDigit = remainder === 10 ? 0 : remainder;
      if (checkDigit !== Number(cpf[position])) return false;
    }
    return true;
  }

  function clearError(input) {
    if (!input) return;
    input.classList.remove(...ERROR_CLASSES, 'cpf-invalid');
    input.removeAttribute('aria-invalid');
    document.getElementById(`${input.id}-error`)?.remove();
  }

  function showError(input, message) {
    if (!input) return false;
    clearError(input);
    input.classList.add(...ERROR_CLASSES, 'cpf-invalid');
    input.setAttribute('aria-invalid', 'true');

    const error = document.createElement('p');
    error.id = `${input.id}-error`;
    error.className = 'cpf-error text-xs text-red-600 mt-1';
    error.textContent = message;
    input.insertAdjacentElement('afterend', error);
    return false;
  }

  function validateInput(input, options = {}) {
    if (!input) return false;
    const cpf = digits(input.value);
    if (!cpf) {
      return options.required === false
        ? (clearError(input), true)
        : showError(input, 'Informe o CPF.');
    }
    if (cpf.length !== 11) return showError(input, 'O CPF deve ter 11 dígitos.');
    if (!isValid(cpf)) return showError(input, 'CPF inválido. Verifique os números informados.');
    clearError(input);
    return true;
  }

  function isEmailMode(input) {
    return input?.dataset.cpfOrEmail !== undefined
      && (input.value.includes('@') || /[A-Za-z]/.test(input.value));
  }

  function handleInput(input) {
    if (isEmailMode(input)) {
      input.maxLength = 254;
      input.inputMode = 'email';
      clearError(input);
      return;
    }

    input.maxLength = input.dataset.cpfOrEmail !== undefined ? 254 : 14;
    input.inputMode = 'numeric';
    input.value = format(input.value);
    if (digits(input.value).length === 11) validateInput(input);
    else clearError(input);
  }

  function setupInput(input) {
    if (!input || input.dataset.cpfReady) return;
    input.dataset.cpfReady = 'true';
    input.addEventListener('input', () => handleInput(input));
    input.addEventListener('blur', () => {
      if (!input.value.trim() || isEmailMode(input)) return clearError(input);
      validateInput(input);
    });
    handleInput(input);
  }

  function setup() {
    document.querySelectorAll('[data-cpf], [data-cpf-or-email]').forEach(setupInput);
  }

  window.RadiaCpf = { clearError, digits, format, isValid, setup, showError, validateInput };
  document.addEventListener('DOMContentLoaded', setup);
})();
