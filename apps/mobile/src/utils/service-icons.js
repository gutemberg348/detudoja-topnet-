const serviceIconMap = {
  airplane: "airplane-outline",
  bicycle: "bicycle-outline",
  boat: "boat-outline",
  briefcase: "briefcase-outline",
  bus: "bus-outline",
  car: "car-outline",
  construct: "construct-outline",
  cube: "cube-outline",
  cut: "cut-outline",
  delivery: "cube-outline",
  desktop: "desktop-outline",
  flash: "flash-outline",
  hammer: "hammer-outline",
  home: "home-outline",
  medical: "medical-outline",
  navigate: "navigate-outline",
  paw: "paw-outline",
  person: "person-outline",
  restaurant: "restaurant-outline",
  school: "school-outline",
  sparkles: "sparkles-outline",
  storefront: "storefront-outline",
  truck: "car-outline",
};

export function serviceIconName(iconName, fallback = "briefcase-outline") {
  return serviceIconMap[String(iconName ?? "").toLowerCase()] ?? fallback;
}
