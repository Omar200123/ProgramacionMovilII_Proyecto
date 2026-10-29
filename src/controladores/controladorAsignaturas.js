const { validationResult } = require('express-validator');
const db = require('../configuracion/db');
const Asignatura = require('../modelos/asignatura');
const Carrera = require('../modelos/carreras');

const incluir = [
  { model: Carrera, as: 'carrera', attributes: ['id', 'codigo', 'nombre'] },
  {
    model: Asignatura,
    as: 'requisitos',
    attributes: ['id', 'codigo', 'nombre'],
    through: { attributes: [] },
  },
];

const normalizarRequisitos = (requisitos) => [...new Set((requisitos || []).map(Number))];

const generaCiclo = async (asignaturaId, requisitos) => {
  const Union = Asignatura.sequelize.models.asignaturas_requisitos;
  const filas = await Union.findAll({ raw: true });
  const dependencias = new Map();
  for (const { asignaturaId: a, requisitoId: r } of filas) {
    if (!dependencias.has(a)) dependencias.set(a, []);
    dependencias.get(a).push(r);
  }

  const visitados = new Set();
  const pila = [...requisitos];
  while (pila.length) {
    const actual = pila.pop();
    if (actual === asignaturaId) return true;
    if (visitados.has(actual)) continue;
    visitados.add(actual);
    pila.push(...(dependencias.get(actual) || []));
  }
  return false;
};

const validarRequisitos = async (asignaturaId, carreraId, requisitos) => {
  if (requisitos.length === 0) return null;
  if (asignaturaId && requisitos.includes(asignaturaId)) {
    return 'Una asignatura no puede ser requisito de sí misma';
  }
  const encontrados = await Asignatura.findAll({ where: { id: requisitos } });
  if (encontrados.length !== requisitos.length) {
    return 'Uno o más requisitos no existen';
  }
  if (encontrados.some((a) => a.carreraId !== carreraId)) {
    return 'Los requisitos deben pertenecer a la misma carrera';
  }
  if (asignaturaId && await generaCiclo(asignaturaId, requisitos)) {
    return 'Los requisitos generan una dependencia circular';
  }
  return null;
};

const listarAsignaturas = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { carreraId } = req.query;
  try {
    const asignaturas = await Asignatura.findAll({
      where: carreraId ? { carreraId } : undefined,
      include: incluir,
      order: [['codigo', 'ASC']],
    });
    res.json(asignaturas);
  } catch (error) {
    console.error('Error al listar las asignaturas:', error);
    res.status(500).json({ error: 'Error al listar las asignaturas' });
  }
};

const obtenerAsignaturaPorId = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.query;
  try {
    const asignatura = await Asignatura.findByPk(id, { include: incluir });
    if (!asignatura) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }
    res.json(asignatura);
  } catch (error) {
    console.error('Error al obtener la asignatura por ID:', error);
    res.status(500).json({ error: 'Error al obtener la asignatura por ID' });
  }
};

const crearAsignatura = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { codigo, nombre, unidadesValorativas, descripcion = null, estado = true, carreraId } = req.body;
  const requisitos = normalizarRequisitos(req.body.requisitos);

  try {
    const errorRequisitos = await validarRequisitos(null, Number(carreraId), requisitos);
    if (errorRequisitos) {
      return res.status(400).json({ error: errorRequisitos });
    }

    const id = await db.transaction(async (t) => {
      const nueva = await Asignatura.create(
        { codigo, nombre, unidadesValorativas, descripcion, estado, carreraId },
        { transaction: t }
      );
      await nueva.setRequisitos(requisitos, { transaction: t });
      return nueva.id;
    });

    const creada = await Asignatura.findByPk(id, { include: incluir });
    res.status(201).json(creada);
  } catch (error) {
    console.error('Error al crear la asignatura:', error);
    res.status(500).json({ error: 'Error al crear la asignatura' });
  }
};

const actualizarAsignatura = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const id = Number(req.query.id);
  const { codigo, nombre, unidadesValorativas, descripcion = null, estado, carreraId } = req.body;
  const requisitos = normalizarRequisitos(req.body.requisitos);

  try {
    const asignatura = await Asignatura.findByPk(id);
    if (!asignatura) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    if (asignatura.carreraId !== Number(carreraId) && await asignatura.countRequeridaPor() > 0) {
      return res.status(409).json({
        error: 'No se puede cambiar de carrera una asignatura que es requisito de otras',
      });
    }

    const errorRequisitos = await validarRequisitos(id, Number(carreraId), requisitos);
    if (errorRequisitos) {
      return res.status(400).json({ error: errorRequisitos });
    }

    await db.transaction(async (t) => {
      await asignatura.update(
        { codigo, nombre, unidadesValorativas, descripcion, estado, carreraId },
        { transaction: t }
      );
      await asignatura.setRequisitos(requisitos, { transaction: t });
    });

    const actualizada = await Asignatura.findByPk(id, { include: incluir });
    res.json(actualizada);
  } catch (error) {
    console.error('Error al actualizar la asignatura:', error);
    res.status(500).json({ error: 'Error al actualizar la asignatura' });
  }
};

const eliminarAsignatura = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.query;
  try {
    const asignatura = await Asignatura.findByPk(id);
    if (!asignatura) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    if (await asignatura.countRequeridaPor() > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar una asignatura que es requisito de otras',
      });
    }

    await asignatura.destroy();
    res.json({ message: 'Asignatura eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar la asignatura:', error);
    res.status(500).json({ error: 'Error al eliminar la asignatura' });
  }
};

module.exports = {
  listarAsignaturas,
  obtenerAsignaturaPorId,
  crearAsignatura,
  actualizarAsignatura,
  eliminarAsignatura,
};