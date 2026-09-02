package il.mashkanta.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** API documentation metadata, served at {@code /swagger-ui.html}. */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI mashkantaOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Smart Mortgage Comparison & Optimization Platform")
                .version("1.0.0")
                .description("""
                        Independent mortgage comparison for the Israeli market. Prices multi-track mixes,
                        enforces Bank of Israel limits, stress tests against rate and inflation shocks, and
                        scores offers against a market baseline built only from public and crowdsourced data.
                        """)
                .contact(new Contact().name("Mashkanta Platform"))
                .license(new License().name("MIT")));
    }
}
