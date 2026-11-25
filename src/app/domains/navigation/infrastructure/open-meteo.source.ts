import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { Coordinate } from '../domain/geo';
import { HourlyWeather, WeatherSource } from '../domain/weather';

interface OpenMeteoPlace {
  hourly?: {
    time: number[];
    temperature_2m: number[];
    precipitation: number[];
    snowfall: number[];
    weather_code: number[];
  };
}

/** Open-Meteo, free and without a key. Positions are rounded to about 100 m. */
@Injectable()
export class OpenMeteoSource extends WeatherSource {
  private readonly http = inject(HttpPort);

  async hourly(places: readonly Coordinate[]): Promise<(HourlyWeather | null)[]> {
    const list = (index: 0 | 1) => places.map((place) => place[index].toFixed(3)).join(',');
    const { ok, body } = await this.http.getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${list(1)}&longitude=${list(0)}` +
        '&hourly=temperature_2m,precipitation,snowfall,weather_code' +
        '&forecast_days=2&timeformat=unixtime',
    );
    if (!ok || !body) throw new Error('Forecast not available.');
    return [body].flat().map((place) => {
      const hourly = (place as OpenMeteoPlace).hourly;
      return hourly
        ? {
            time: hourly.time,
            temperature: hourly.temperature_2m,
            precipitation: hourly.precipitation,
            snowfall: hourly.snowfall,
            code: hourly.weather_code,
          }
        : null;
    });
  }
}
