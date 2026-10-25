package com.jielei.xarxa.nativeapp.domain

/** Port of src/utils/lineDim.js (the MapLibre expression builder is the UI's job; use [DIM_FACTOR]). */
const val DIM_FACTOR = 0.2

/** With no Station selected every Line counts as serving it. */
fun lineServesStation(lineId: String, selectedStation: Station?): Boolean =
    selectedStation == null || selectedStation.lines.contains(lineId)

fun dimmedVehicleOpacity(baseOpacity: Double, lineId: String, selectedStation: Station?): Double =
    if (lineServesStation(lineId, selectedStation)) baseOpacity else baseOpacity * DIM_FACTOR

/** Only live Vehicles on a Line serving the selected Station pulse; nothing pulses with no selection. */
fun vehicleShouldPulse(isLive: Boolean, lineId: String, selectedStation: Station?): Boolean =
    isLive && selectedStation != null && lineServesStation(lineId, selectedStation)

fun vehicleShouldPulse(vehicle: TrainPosition, selectedStation: Station?): Boolean =
    vehicleShouldPulse(vehicle.isLive, vehicle.line, selectedStation)
