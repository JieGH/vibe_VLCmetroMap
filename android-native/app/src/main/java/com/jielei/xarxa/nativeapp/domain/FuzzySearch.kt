package com.jielei.xarxa.nativeapp.domain

import java.text.Normalizer

/** Port of src/utils/fuzzySearch.js. */
object FuzzySearch {
    private val combining = Regex("[\\u0300-\\u036f]")
    private val punctuation = Regex("[·'’/\\\\_-]")
    private val spaces = Regex("\\s+")

    fun normalizeAccents(str: String?): String {
        if (str.isNullOrEmpty()) return ""
        return Normalizer.normalize(str, Normalizer.Form.NFD).replace(combining, "").lowercase()
    }

    // JS `\bpl\b\.?` with the i flag. Java word boundaries over ASCII letters behave the same here.
    private val plRe = Regex("\\bpl\\b\\.?", RegexOption.IGNORE_CASE)
    private val avRe = Regex("\\bav\\b\\.?", RegexOption.IGNORE_CASE)
    private val drRe = Regex("\\bdr\\b\\.?", RegexOption.IGNORE_CASE)

    fun expandTransitAliases(str: String?): String {
        if (str.isNullOrEmpty()) return ""
        return str.replace(plRe, "placa pl").replace(avRe, "avinguda av").replace(drRe, "doctor dr")
    }

    fun cleanSearchText(str: String?): String =
        normalizeAccents(str).replace(punctuation, " ").replace(spaces, " ").trim()

    /** Score > 0 when matched (higher ranks better), or null. */
    fun fuzzyScore(target: String?, query: String?): Int? {
        if (target.isNullOrEmpty() || query.isNullOrEmpty()) return null

        val rawNormTarget = cleanSearchText(target)
        val normQuery = cleanSearchText(query)
        if (normQuery.isEmpty()) return null

        if (rawNormTarget == normQuery) return 1000
        if (rawNormTarget.startsWith(normQuery)) return 800 - (rawNormTarget.length - normQuery.length)

        val compactTarget = rawNormTarget.replace(spaces, "")
        val compactQuery = normQuery.replace(spaces, "")
        if (compactTarget.startsWith(compactQuery)) return 750 - (compactTarget.length - compactQuery.length)

        for (word in rawNormTarget.split(' ')) {
            if (word.startsWith(normQuery)) return 650
        }

        val expandedTarget = cleanSearchText(expandTransitAliases(target))
        if (expandedTarget != rawNormTarget) {
            if (expandedTarget.startsWith(normQuery)) return 620
            for (word in expandedTarget.split(' ')) {
                if (word.startsWith(normQuery)) return 600
            }
        }

        if (rawNormTarget.contains(normQuery)) return 500 - rawNormTarget.indexOf(normQuery)
        if (compactTarget.contains(compactQuery)) return 480
        if (expandedTarget.contains(normQuery)) return 450

        val queryWords = normQuery.split(' ')
        if (queryWords.size > 1 && queryWords.all { expandedTarget.contains(it) || compactTarget.contains(it) }) return 400

        if (compactQuery.length >= 3) {
            var t = 0
            var q = 0
            while (t < compactTarget.length && q < compactQuery.length) {
                if (compactTarget[t] == compactQuery[q]) q++
                t++
            }
            if (q == compactQuery.length) return 250 - (compactTarget.length - compactQuery.length)
        }
        return null
    }

    /** Matching items, best score first, ties by shorter text. Stable. */
    fun <T> searchFuzzy(items: List<T>, query: String?, getText: (T) -> String): List<T> {
        if (query.isNullOrBlank()) return emptyList()
        class Scored(val item: T, val score: Int, val len: Int)
        val scored = ArrayList<Scored>()
        for (item in items) {
            val text = getText(item)
            val s = fuzzyScore(text, query)
            if (s != null) scored.add(Scored(item, s, text.length))
        }
        return scored.sortedWith { a, b -> if (b.score != a.score) b.score - a.score else a.len - b.len }.map { it.item }
    }
}
