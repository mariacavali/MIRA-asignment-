import { makeRequest, type GeocodingResult, type TimeZoneResult } from "../_core/map";

type AutocompleteResult = {
  predictions?: Array<{
    description?: string;
    place_id?: string;
    types?: string[];
  }>;
  status?: string;
};

export type BirthCitySuggestion = {
  placeId: string;
  description: string;
};

export type ResolvedBirthLocation = {
  city: string;
  country: string;
  timezone: string;
};

function addressComponent(result: GeocodingResult["results"][number], type: string) {
  return result.address_components.find(component => component.types.includes(type))?.long_name ?? null;
}

function isCityResult(result: GeocodingResult["results"][number]) {
  return result.types.includes("locality") || result.types.includes("postal_town") || result.types.includes("administrative_area_level_3");
}

export async function searchBirthCities(query: string): Promise<BirthCitySuggestion[]> {
  const result = await makeRequest<AutocompleteResult>("/maps/api/place/autocomplete/json", {
    input: query,
    types: "(cities)",
  });
  if (result.status !== "OK" && result.status !== "ZERO_RESULTS") {
    throw new Error("Birth city search is temporarily unavailable");
  }
  return (result.predictions ?? [])
    .filter(prediction => Boolean(prediction.place_id && prediction.description))
    .slice(0, 6)
    .map(prediction => ({ placeId: prediction.place_id!, description: prediction.description! }));
}

export async function resolveBirthLocation(placeId: string): Promise<ResolvedBirthLocation> {
  const geocoding = await makeRequest<GeocodingResult>("/maps/api/geocode/json", { place_id: placeId });
  const location = geocoding.results.find(isCityResult) ?? geocoding.results[0];
  if (geocoding.status !== "OK" || !location) {
    throw new Error("Select a city from the suggested locations");
  }

  const city =
    addressComponent(location, "locality") ??
    addressComponent(location, "postal_town") ??
    addressComponent(location, "administrative_area_level_3");
  const country = addressComponent(location, "country");
  if (!city || !country) {
    throw new Error("Select a recognised city with a country");
  }

  const timezone = await makeRequest<TimeZoneResult>("/maps/api/timezone/json", {
    location: `${location.geometry.location.lat},${location.geometry.location.lng}`,
    timestamp: Math.floor(Date.now() / 1000),
  });
  if (timezone.status !== "OK" || !timezone.timeZoneId) {
    throw new Error("Timezone lookup is temporarily unavailable");
  }

  return { city, country, timezone: timezone.timeZoneId };
}
