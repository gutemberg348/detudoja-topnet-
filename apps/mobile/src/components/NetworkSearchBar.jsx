import { AppInput } from "./AppInput";

export function NetworkSearchBar({ onChangeText, value }) {
  return (
    <AppInput
      icon="search-outline"
      onChangeText={onChangeText}
      placeholder="Buscar pessoa ou parceiro na rede"
      value={value}
    />
  );
}
