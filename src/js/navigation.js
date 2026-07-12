export function initForm() {
  const form = document.querySelector('#newWatchForm');

  if (!form) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const description = form.watchDescription.value.trim();
    const url = form.watchUrl.value.trim();

    const message = url
      ? `Watch request received for: ${description} (URL: ${url})`
      : `Watch request received for: ${description}`;

    alert(message);
    form.reset();
  });
}
