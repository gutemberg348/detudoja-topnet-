import {
  createAdminSalesSegment,
  deleteAdminSalesSegment,
  listAdminSalesSegments,
  updateAdminSalesSegment,
} from "./admin-segments.service.js";

export async function listAdminSalesSegmentsController(req, res, next) {
  try {
    res.json(await listAdminSalesSegments(req.query));
  } catch (error) {
    next(error);
  }
}

export async function createAdminSalesSegmentController(req, res, next) {
  try {
    res.status(201).json(await createAdminSalesSegment(req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminSalesSegmentController(req, res, next) {
  try {
    res.json(await updateAdminSalesSegment(req.params.segmentId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminSalesSegmentController(req, res, next) {
  try {
    await deleteAdminSalesSegment(req.params.segmentId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
