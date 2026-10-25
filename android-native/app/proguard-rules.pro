# R8 keep rules for the release build.
# MapLibre Native: JNI looks up Java classes/methods by name from C++; its AAR ships consumer rules,
# these are belt and braces.
-keep class org.maplibre.** { *; }
-dontwarn org.maplibre.**
-keep class com.mapbox.** { *; }
-dontwarn com.mapbox.**

# kotlinx.serialization (consumer rules cover most; keep generated serializers + companions).
-keepattributes *Annotation*, InnerClasses, Signature, RuntimeVisibleAnnotations
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.jielei.xarxa.nativeapp.**$$serializer { *; }
-keepclassmembers class com.jielei.xarxa.nativeapp.** { *** Companion; }
-keepclasseswithmembers class com.jielei.xarxa.nativeapp.** { kotlinx.serialization.KSerializer serializer(...); }

# Compose / coroutines need no extra rules (AARs ship them). Keep line numbers for crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
