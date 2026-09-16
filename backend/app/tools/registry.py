from typing import Callable, Dict, Any, List

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, Callable] = {}
        self._schemas: List[Dict[str, Any]] = []

    def register(self, name: str, description: str, parameters: Dict[str, Any]):
        """Decorator to register a tool with its OpenAI JSON Schema."""
        def decorator(func: Callable):
            self._tools[name] = func
            self._schemas.append({
                "type": "function",
                "name": name,
                "description": description,
                "parameters": parameters
            })
            return func
        return decorator

    def get_schemas(self) -> List[Dict[str, Any]]:
        return self._schemas

    def get_gemini_tools(self) -> List[Dict[str, Any]]:
        """Returns tools formatted for Gemini Live API."""
        # Gemini format requires "function_declarations" array. This method returns the items inside it.
        return [
            {
                "name": schema["name"],
                "description": schema["description"],
                "parameters": schema["parameters"]
            }
            for schema in self._schemas
        ]
        
    async def execute(self, name: str, arguments: Dict[str, Any]) -> Any:
        if name not in self._tools:
            raise ValueError(f"Tool {name} not found.")
        func = self._tools[name]
        
        # If it's an async function, await it
        import inspect
        if inspect.iscoroutinefunction(func):
            return await func(**arguments)
        return func(**arguments)

registry = ToolRegistry()
