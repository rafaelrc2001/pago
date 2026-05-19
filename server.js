require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Seguridad: headers HTTP recomendados
app.use(helmet());

// Rate limiting: máximo 20 intentos de pago por IP cada 15 minutos
const limiterPago = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta en unos minutos.' },
});

// El endpoint de webhook necesita el cuerpo en crudo — debe ir ANTES de express.json()
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error('Webhook: firma inválida:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log(`Pago confirmado — session: ${session.id}`);
        // TODO: marcar pedido como pagado en la base de datos, enviar email de confirmación
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        console.log(`Sesión expirada — session: ${session.id}`);
        break;
      }
      default:
        console.log(`Evento no manejado: ${event.type}`);
    }

    res.json({ received: true });
  },
);

app.use(express.json());
app.use(express.static('public'));

// Catálogo de productos — en producción esto debería venir de una base de datos
const PRODUCTOS = {
  producto1: { nombre: 'Producto 1', precio: 1000, moneda: 'mxn' },
  producto2: { nombre: 'Producto 2', precio: 1500, moneda: 'mxn' },
};

app.post('/crear-sesion-pago', limiterPago, async (req, res) => {
  const { productoId } = req.body;

  // Validación estricta de entrada
  if (typeof productoId !== 'string' || !Object.prototype.hasOwnProperty.call(PRODUCTOS, productoId)) {
    return res.status(400).json({ error: 'Producto no válido.' });
  }

  const producto = PRODUCTOS[productoId];

  try {
    const sesion = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: producto.moneda,
            product_data: { name: producto.nombre },
            unit_amount: producto.precio,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // session_id en success_url permite verificar el pago en el servidor
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cancel.html`,
    });

    res.json({ url: sesion.url });
  } catch (err) {
    // Nunca exponer detalles internos al cliente
    console.error('Stripe error al crear sesión:', err.message);
    res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' });
  }
});

// Manejo centralizado de errores no capturados
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en ${BASE_URL}`);
});
