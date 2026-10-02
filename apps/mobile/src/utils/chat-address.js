export function addressDirectionsUrl(location) {
  // Saved street addresses have no GPS coordinates. Search the full address,
  // never use the sender's current position as a substitute destination.
  const destination = [location?.street, location?.number, location?.district,
    location?.city, location?.state, location?.zipCode, "Brasil"]
    .filter((part) => part != null && String(part).trim())
    .map((part) => String(part).trim()).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
