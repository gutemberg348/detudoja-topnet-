export function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.flatten();
      const fieldMessage = Object.values(details.fieldErrors).flat().find(Boolean);
      const error = new Error(fieldMessage ?? "Invalid request payload");
      error.statusCode = 400;
      error.details = details;
      next(error);
      return;
    }

    req[source] = result.data;
    next();
  };
}
