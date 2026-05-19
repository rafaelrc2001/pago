async function pagar(productoId, boton) {
  const errorEl = document.getElementById(`error-${productoId}`);

  // Resetear estado anterior
  errorEl.textContent = '';
  errorEl.classList.remove('visible');
  boton.disabled = true;
  boton.textContent = 'Procesando...';

  try {
    const respuesta = await fetch('/crear-sesion-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productoId }),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(datos.error || 'Error al iniciar el pago.');
    }

    // Redirigir a Stripe Checkout
    window.location.href = datos.url;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add('visible');
    boton.disabled = false;
    boton.textContent = 'Comprar';
  }
}
