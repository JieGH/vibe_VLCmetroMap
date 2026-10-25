package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.NetworkData
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/** The real bundled network data, parsed on the JVM (unit tests run with the module dir as cwd). */
object TestData {
    val network: NetworkData by lazy {
        val dir = File("src/main/assets/data")
        require(dir.isDirectory) { "assets/data not found from ${File(".").absolutePath}" }
        NetworkData.parse { name, strategy ->
            NetworkData.json.decodeFromString(strategy, File(dir, name).readText())
        }
    }

    fun vectors(name: String): JsonElement {
        val text = TestData::class.java.getResource("/vectors/$name")!!.readText()
        return Json.parseToJsonElement(text)
    }
}

class FakeClock(var now: Long) : Clock {
    override fun nowMs() = now
}

val JsonElement.obj: JsonObject get() = jsonObject
val JsonElement.arr: JsonArray get() = jsonArray
val JsonElement.str: String? get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
val JsonElement.dbl: Double get() = jsonPrimitive.doubleOrNull ?: error("not a number: $this")
val JsonElement.dblOrNull: Double? get() = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
val JsonElement.bool: Boolean get() = jsonPrimitive.booleanOrNull ?: error("not a boolean: $this")
val JsonElement.isNull: Boolean get() = this is kotlinx.serialization.json.JsonNull

/** Smallest angular difference of two compass bearings. */
fun bearingDiff(a: Double, b: Double): Double {
    val d = Math.abs(a - b) % 360
    return minOf(d, 360 - d)
}
