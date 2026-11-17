# O libsodium entra por JNI. O R8 não pode apagar essas classes nem os métodos nativos.
-keep class com.goterl.lazysodium.** { *; }
-keep class com.sun.jna.** { *; }
-keepclasseswithmembernames class * { native <methods>; }
-dontwarn java.awt.**
-dontwarn com.sun.jna.**

# Os nomes do formato ficam estáveis para o teste e para o preenchimento automático.
-keep class app.broquel.cripto.** { *; }

# Release não deixa Log no pacote, caso alguém acrescente um no futuro.
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}
