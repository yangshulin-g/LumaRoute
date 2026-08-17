use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initialize profiles lines and preferences",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_initial_migration() {
        let items = migrations();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].version, 1);
        assert!(items[0].sql.contains("credential_key"));
        assert!(!items[0].sql.to_lowercase().contains("access_token"));
        assert!(!items[0].sql.to_lowercase().contains("password"));
    }
}
