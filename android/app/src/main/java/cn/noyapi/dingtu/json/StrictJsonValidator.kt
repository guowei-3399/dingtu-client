// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.json

class StrictJsonException(message: String) : IllegalArgumentException(message)

object StrictJsonValidator {
    private val FORBIDDEN_OBJECT_KEYS = setOf("__proto__", "constructor", "prototype")

    fun assertStrictJson(
        text: String,
        maxDepth: Int = 12,
        rejectCaseCollisions: Boolean = false,
        allowedKeys: Set<String>? = null,
        dynamicMapParentKey: String? = null,
    ) {
        val parser = Parser(
            text = text,
            maxDepth = maxDepth,
            rejectCaseCollisions = rejectCaseCollisions,
            allowedKeys = allowedKeys,
            dynamicMapParentKey = dynamicMapParentKey,
        )
        parser.parseDocument()
    }

    fun extractFirstArrayElementRawObject(jsonText: String, topLevelKey: String): String {
        val parser = Parser(
            text = jsonText,
            maxDepth = 12,
            rejectCaseCollisions = false,
            allowedKeys = null,
            dynamicMapParentKey = null,
        )
        return parser.extractFirstElementOfTopLevelArray(topLevelKey)
    }

    private class Parser(
        private val text: String,
        private val maxDepth: Int,
        private val rejectCaseCollisions: Boolean,
        private val allowedKeys: Set<String>?,
        private val dynamicMapParentKey: String?,
    ) {
        private var pos = 0
        private val len = text.length

        fun parseDocument() {
            skipWhitespace()
            if (pos >= len) {
                throw StrictJsonException("Empty JSON input")
            }
            parseValue(depth = 1, allowDynamicKeys = false)
            skipWhitespace()
            if (pos != len) {
                throw StrictJsonException("Unexpected trailing characters at position $pos")
            }
        }

        fun extractFirstElementOfTopLevelArray(targetKey: String): String {
            skipWhitespace()
            expectChar('{')
            skipWhitespace()
            if (peek() == '}') {
                throw StrictJsonException("Target array key '$targetKey' not found in empty object")
            }
            while (true) {
                skipWhitespace()
                val key = parseString()
                skipWhitespace()
                expectChar(':')
                skipWhitespace()
                if (key == targetKey) {
                    expectChar('[')
                    skipWhitespace()
                    if (peek() != '{') {
                        throw StrictJsonException("Expected JSON object as first element of '$targetKey'")
                    }
                    val start = pos
                    parseObject(depth = 2, allowDynamicKeys = true)
                    val end = pos
                    return text.substring(start, end)
                } else {
                    parseValue(depth = 2, allowDynamicKeys = true)
                }
                skipWhitespace()
                when (val ch = nextChar()) {
                    ',' -> continue
                    '}' -> break
                    else -> throw StrictJsonException("Expected ',' or '}' at position ${pos - 1}, got '$ch'")
                }
            }
            throw StrictJsonException("Top-level array key '$targetKey' not found")
        }

        private fun parseValue(depth: Int, allowDynamicKeys: Boolean) {
            if (depth > maxDepth) {
                throw StrictJsonException("JSON nesting exceeds maximum depth $maxDepth")
            }
            skipWhitespace()
            when (val ch = peek()) {
                '{' -> parseObject(depth, allowDynamicKeys)
                '[' -> parseArray(depth)
                '"' -> parseString()
                't' -> expectLiteral("true")
                'f' -> expectLiteral("false")
                'n' -> expectLiteral("null")
                '-', in '0'..'9' -> parseNumber()
                else -> throw StrictJsonException("Unexpected character '$ch' at position $pos")
            }
        }

        private fun parseObject(depth: Int, allowDynamicKeys: Boolean) {
            expectChar('{')
            skipWhitespace()
            if (peek() == '}') {
                pos++
                return
            }
            val seenExact = HashSet<String>()
            val seenLower = HashSet<String>()

            while (true) {
                skipWhitespace()
                if (peek() != '"') {
                    throw StrictJsonException("Expected string object key at position $pos")
                }
                val key = parseString()
                if (key in FORBIDDEN_OBJECT_KEYS) {
                    throw StrictJsonException("Forbidden JSON object key: $key")
                }
                if (!seenExact.add(key)) {
                    throw StrictJsonException("Duplicate JSON object key: $key")
                }
                if (rejectCaseCollisions) {
                    val lower = key.lowercase()
                    if (!seenLower.add(lower)) {
                        throw StrictJsonException("Case-colliding JSON object key: $key")
                    }
                }
                if (!allowDynamicKeys && allowedKeys != null && key !in allowedKeys) {
                    throw StrictJsonException("Disallowed JSON object key: $key")
                }

                skipWhitespace()
                expectChar(':')
                val childAllowDynamic =
                    !allowDynamicKeys && dynamicMapParentKey != null && key == dynamicMapParentKey
                parseValue(depth = depth + 1, allowDynamicKeys = childAllowDynamic)
                skipWhitespace()
                when (val sep = nextChar()) {
                    ',' -> {
                        skipWhitespace()
                        if (peek() == '}') {
                            throw StrictJsonException("Trailing comma in JSON object at position $pos")
                        }
                    }
                    '}' -> return
                    else -> throw StrictJsonException("Expected ',' or '}' at position ${pos - 1}, got '$sep'")
                }
            }
        }

        private fun parseArray(depth: Int) {
            expectChar('[')
            skipWhitespace()
            if (peek() == ']') {
                pos++
                return
            }
            while (true) {
                parseValue(depth = depth + 1, allowDynamicKeys = false)
                skipWhitespace()
                when (val sep = nextChar()) {
                    ',' -> {
                        skipWhitespace()
                        if (peek() == ']') {
                            throw StrictJsonException("Trailing comma in JSON array at position $pos")
                        }
                    }
                    ']' -> return
                    else -> throw StrictJsonException("Expected ',' or ']' at position ${pos - 1}, got '$sep'")
                }
            }
        }

        private fun parseString(): String {
            expectChar('"')
            val sb = StringBuilder()
            while (pos < len) {
                val ch = text[pos++]
                when {
                    ch == '"' -> return sb.toString()
                    ch < '\u0020' -> throw StrictJsonException("Unescaped control character in JSON string")
                    ch == '\\' -> {
                        if (pos >= len) throw StrictJsonException("Unterminated escape in JSON string")
                        when (val esc = text[pos++]) {
                            '"', '\\', '/' -> sb.append(esc)
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'u' -> {
                                val codeUnit = parseHex4()
                                if (codeUnit in 0xD800..0xDBFF && pos + 1 < len && text[pos] == '\\' && text[pos + 1] == 'u') {
                                    pos += 2
                                    val low = parseHex4()
                                    if (low !in 0xDC00..0xDFFF) {
                                        throw StrictJsonException("Invalid UTF-16 surrogate pair in JSON string")
                                    }
                                    val codePoint = 0x10000 + ((codeUnit - 0xD800) shl 10) + (low - 0xDC00)
                                    sb.appendCodePoint(codePoint)
                                } else if (codeUnit in 0xD800..0xDFFF) {
                                    throw StrictJsonException("Unpaired UTF-16 surrogate in JSON string")
                                } else {
                                    sb.append(codeUnit.toChar())
                                }
                            }
                            else -> throw StrictJsonException("Invalid escape sequence '\\$esc' in JSON string")
                        }
                    }
                    else -> sb.append(ch)
                }
            }
            throw StrictJsonException("Unterminated JSON string")
        }

        private fun parseHex4(): Int {
            if (pos + 4 > len) {
                throw StrictJsonException("Incomplete \\uXXXX escape in JSON string")
            }
            var value = 0
            repeat(4) {
                val c = text[pos++]
                val digit = when (c) {
                    in '0'..'9' -> c - '0'
                    in 'a'..'f' -> c - 'a' + 10
                    in 'A'..'F' -> c - 'A' + 10
                    else -> throw StrictJsonException("Invalid hex digit '$c' in \\uXXXX escape")
                }
                value = (value shl 4) or digit
            }
            return value
        }

        private fun parseNumber() {
            if (peek() == '-') pos++
            if (pos >= len) throw StrictJsonException("Incomplete JSON number")
            when (val first = text[pos]) {
                '0' -> {
                    pos++
                    if (pos < len && text[pos] in '0'..'9') {
                        throw StrictJsonException("Leading zeros are not allowed in JSON numbers")
                    }
                }
                in '1'..'9' -> {
                    pos++
                    while (pos < len && text[pos] in '0'..'9') pos++
                }
                else -> throw StrictJsonException("Invalid JSON number at position $pos: '$first'")
            }
            if (pos < len && text[pos] == '.') {
                pos++
                if (pos >= len || text[pos] !in '0'..'9') {
                    throw StrictJsonException("Invalid fractional part in JSON number")
                }
                while (pos < len && text[pos] in '0'..'9') pos++
            }
            if (pos < len && (text[pos] == 'e' || text[pos] == 'E')) {
                pos++
                if (pos < len && (text[pos] == '+' || text[pos] == '-')) pos++
                if (pos >= len || text[pos] !in '0'..'9') {
                    throw StrictJsonException("Invalid exponent in JSON number")
                }
                while (pos < len && text[pos] in '0'..'9') pos++
            }
        }

        private fun expectLiteral(literal: String) {
            if (!text.startsWith(literal, pos)) {
                throw StrictJsonException("Expected literal '$literal' at position $pos")
            }
            pos += literal.length
        }

        private fun expectChar(expected: Char) {
            val actual = nextChar()
            if (actual != expected) {
                throw StrictJsonException("Expected '$expected' at position ${pos - 1}, got '$actual'")
            }
        }

        private fun peek(): Char {
            if (pos >= len) {
                throw StrictJsonException("Unexpected end of JSON input at position $pos")
            }
            return text[pos]
        }

        private fun nextChar(): Char {
            val ch = peek()
            pos++
            return ch
        }

        private fun skipWhitespace() {
            while (pos < len) {
                when (text[pos]) {
                    ' ', '\t', '\r', '\n' -> pos++
                    else -> return
                }
            }
        }
    }
}
