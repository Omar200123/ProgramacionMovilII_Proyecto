const {Router} = require('express');
const controladorPeriodo = require('../controladores/controladorPeriodo');
const { body, query } = require('express-validator');
const router = Router();

router.post('/periodo', [
    body('periodoquecursa').notEmpty().withMessage('El campo periodoquecursa es obligatorio'),
    body('año').notEmpty().withMessage('El campo año es obligatorio'),
    body('fechainicio').optional().isDate().withMessage('El campo fechainicio debe ser una fecha válida'),
    body('fechafin').optional().isDate().withMessage('El campo fechafin debe ser una fecha válida'),
], controladorPeriodo.crearPeriodo);

router.get('/periodos', controladorPeriodo.obtenerPeriodos);

router.get('/periodo/:id', controladorPeriodo.listarPeriodoPorId);

router.put('/periodo/:id', [
    body('periodoquecursa').notEmpty().withMessage('El campo periodoquecursa es obligatorio'),
    body('año').notEmpty().withMessage('El campo año es obligatorio'),
    body('fechainicio').optional().isDate().withMessage('El campo fechainicio debe ser una fecha válida'),
    body('fechafin').optional().isDate().withMessage('El campo fechafin debe ser una fecha válida'),
], controladorPeriodo.actualizarPeriodo);

router.delete('/periodo/:id', controladorPeriodo.eliminarPeriodo);

module.exports = router;


