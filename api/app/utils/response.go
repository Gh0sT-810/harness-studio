package utils

import (
	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/gin-gonic/gin"
)

func SuccessResponse(c *gin.Context, code int, message string, data interface{}) {
	c.JSON(code, models.ResponseBody{
		Success:    true,
		Message:    message,
		StatusCode: code,
		Data:       data,
	})
}

func SuccessResponseNoData(c *gin.Context, code int, message string) {
	c.JSON(code, models.ResponseBody{
		Success:    true,
		Message:    message,
		StatusCode: code,
	})
}

func ErrorResponse(c *gin.Context, code int, message string) {
	c.JSON(code, models.ResponseBody{
		Success:    false,
		Message:    message,
		StatusCode: code,
	})
}
