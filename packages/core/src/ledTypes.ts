import type { ColorOrder } from "./color";

/** A physical LED product. Used for defaults (color order, channels) and power estimates. */
export interface LedType {
  id: string;
  name: string;
  /** Typical native wire order of the chip. */
  nativeOrder: ColorOrder;
  /** Approx. current per channel at full brightness, in milliamps. */
  maPerChannel: number;
  voltage: number;
  /** WLED bus type id (hw.led.ins[].type) used when generating WLED config. */
  wledType: number;
}

export const LED_TYPES: readonly LedType[] = [
  {
    id: "ws2812b",
    name: "WS2812B / NeoPixel",
    nativeOrder: "GRB",
    maPerChannel: 20,
    voltage: 5,
    wledType: 22,
  },
  {
    id: "ws2811",
    name: "WS2811 (12V pixel)",
    nativeOrder: "RGB",
    maPerChannel: 20,
    voltage: 12,
    wledType: 22,
  },
  { id: "ws2815", name: "WS2815", nativeOrder: "GRB", maPerChannel: 12, voltage: 12, wledType: 22 },
  { id: "sk6812rgbw", name: "SK6812 RGBW", nativeOrder: "GRBW", maPerChannel: 20, voltage: 5, wledType: 30 },
  { id: "apa102", name: "APA102 / SK9822", nativeOrder: "BGR", maPerChannel: 20, voltage: 5, wledType: 51 },
  {
    id: "generic-rgb",
    name: "Generic RGB pixel",
    nativeOrder: "RGB",
    maPerChannel: 20,
    voltage: 5,
    wledType: 22,
  },
];

export function getLedType(id: string): LedType {
  return LED_TYPES.find((t) => t.id === id) ?? LED_TYPES[0]!;
}
