import { Provider } from '@angular/core';
import { Reminder, Reminders } from '@core/device';
import { CarPark, CarParkSource } from './domain/handover';
import { LonLat, ParkingRepository, ParkingSpot } from './domain/parking';

export class FakeReminders extends Reminders {
  scheduled: readonly Reminder[] = [];
  allowed = true;

  async schedule(reminders: readonly Reminder[]): Promise<boolean> {
    this.scheduled = this.allowed ? reminders : [];
    return this.allowed;
  }
  async cancel(): Promise<void> {
    this.scheduled = [];
  }
}

export class FakeParkingRepository extends ParkingRepository {
  spot?: ParkingSpot;

  async load(): Promise<ParkingSpot | undefined> {
    return this.spot;
  }
  async save(spot: ParkingSpot | null): Promise<void> {
    this.spot = spot ?? undefined;
  }
}

export class FakeCarParks extends CarParkSource {
  parks: CarPark[] | Error = [];
  asked?: LonLat;

  async around(at: LonLat): Promise<CarPark[]> {
    this.asked = at;
    if (this.parks instanceof Error) throw this.parks;
    return this.parks;
  }
}

export function parkingTesting() {
  const fakes = {
    carParks: new FakeCarParks(),
    reminders: new FakeReminders(),
    repository: new FakeParkingRepository(),
  };
  const providers: Provider[] = [
    { provide: CarParkSource, useValue: fakes.carParks },
    { provide: Reminders, useValue: fakes.reminders },
    { provide: ParkingRepository, useValue: fakes.repository },
  ];
  return { ...fakes, providers };
}
