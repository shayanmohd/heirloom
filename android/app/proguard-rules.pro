# JS bridge: the WebView calls these by name via reflection.
-keepclassmembers class com.mohdshayan.heirloom.MainActivity$Native { public *; }
-keep class com.mohdshayan.heirloom.MainActivity$Native { *; }
