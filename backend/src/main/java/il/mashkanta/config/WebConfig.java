package il.mashkanta.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Cross-origin configuration for the single-page frontend.
 *
 * <p>Allowed origins come from configuration rather than a wildcard: the API is read-mostly but it
 * does accept uploads, and a wildcard would let any page on the internet post documents through a
 * visitor's browser.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    // localhost and 127.0.0.1 are distinct origins to a browser: a same-origin POST through the
    // Vite proxy carries whichever the developer typed, and omitting one produces a 403 on POST
    // while GET — which sends no Origin header — keeps working.
    @Value("${app.cors.allowed-origins:"
            + "http://localhost:5173,http://127.0.0.1:5173,"
            + "http://localhost:4173,http://127.0.0.1:4173}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Content-Type", "Authorization")
                .maxAge(3600);
    }
}
